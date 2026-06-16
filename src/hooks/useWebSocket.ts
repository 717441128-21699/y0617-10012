import { useEffect, useRef, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import { crdtManager } from '../crdt/CRDTManager';
import type {
  Operation,
  User,
  Point,
  WSMessage,
  HistoryMessage,
  OperationMessage,
  CursorMessage,
  UserJoinMessage,
  UserLeaveMessage,
  UsersMessage,
} from '../../shared/types';

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

class WebSocketManager {
  private static instance: WebSocketManager;
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isManualClose = false;
  private currentUser: User | null = null;
  private isConnected = false;
  private isConnecting = false;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private messageHandlers: Set<(message: WSMessage) => void> = new Set();
  private initialized = false;

  private constructor() {}

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.connect();
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnected || this.isConnecting) {
      return;
    }

    this.isManualClose = false;
    this.isConnecting = true;

    try {
      const wsUrl = getWebSocketUrl();
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        console.log('WebSocket connected to', wsUrl);
        this.isConnected = true;
        this.isConnecting = false;
        useWhiteboardStore.getState().setIsConnected(true);

        const storedUserId = localStorage.getItem('whiteboard_user_id');
        const storedUserName = localStorage.getItem('whiteboard_user_name');

        ws.send(
          JSON.stringify({
            type: 'init',
            payload: {
              userId: storedUserId || '',
              userName: storedUserName || '',
            },
          })
        );

        if (!this.cleanupTimer) {
          this.cleanupTimer = setInterval(() => {
            useWhiteboardStore.getState().cleanupRemoteCursors();
          }, 5000);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          this.handleMessage(message);
          this.messageHandlers.forEach((handler) => handler(message));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.isConnecting = false;
        this.ws = null;
        useWhiteboardStore.getState().setIsConnected(false);

        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
  }

  forceDisconnect(): void {
    this.isManualClose = true;
    this.isConnecting = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, 3000);
  }

  private refreshOperationsFromCRDT(): void {
    const ops = crdtManager.getOperations();
    useWhiteboardStore.getState().setOperations(ops);
    if (this.currentUser) {
      const { undoStack, redoStack } = crdtManager.getMyUndoRedoStacks(this.currentUser.id);
      useWhiteboardStore.getState().setUndoRedoStacks(undoStack, redoStack);
    }
  }

  private handleMessage(message: WSMessage): void {
    switch (message.type) {
      case 'history': {
        const payload = message.payload as HistoryMessage & { currentUser: User };
        this.handleHistory(payload);
        break;
      }
      case 'operation': {
        const payload = message.payload as OperationMessage;
        this.handleOperation(payload);
        break;
      }
      case 'cursor': {
        const payload = message.payload as CursorMessage;
        this.handleCursor(payload);
        break;
      }
      case 'user-join': {
        const payload = message.payload as UserJoinMessage;
        this.handleUserJoin(payload);
        break;
      }
      case 'user-leave': {
        const payload = message.payload as UserLeaveMessage;
        this.handleUserLeave(payload);
        break;
      }
      case 'users': {
        const payload = message.payload as UsersMessage;
        this.handleUsers(payload);
        break;
      }
    }
  }

  private handleHistory(payload: HistoryMessage & { currentUser: User }): void {
    const { operations, users, currentUser } = payload;

    localStorage.setItem('whiteboard_user_id', currentUser.id);
    localStorage.setItem('whiteboard_user_name', currentUser.name);

    this.currentUser = currentUser;
    useWhiteboardStore.getState().setCurrentUser(currentUser);

    const otherUsers = users.filter((u) => u.id !== currentUser.id);
    useWhiteboardStore.getState().setUsers(otherUsers);

    crdtManager.clear();
    operations.forEach((op) => {
      crdtManager.applyOperation(op);
    });

    this.refreshOperationsFromCRDT();

    console.log(`Loaded ${operations.length} operations from history for user ${currentUser.name}`);
  }

  private handleOperation(payload: OperationMessage): void {
    const { operation } = payload;

    if (crdtManager.hasOperation(operation.id)) {
      return;
    }

    const applied = crdtManager.applyOperation(operation);
    if (applied) {
      this.refreshOperationsFromCRDT();
    }
  }

  private handleCursor(payload: CursorMessage): void {
    const { userId, position } = payload;
    if (this.currentUser && userId === this.currentUser.id) {
      return;
    }
    useWhiteboardStore.getState().updateRemoteCursor(userId, position);
  }

  private handleUserJoin(payload: UserJoinMessage): void {
    const { user } = payload;
    if (this.currentUser && user.id === this.currentUser.id) {
      return;
    }
    useWhiteboardStore.getState().addUser(user);
    console.log(`User joined: ${user.name}`);
  }

  private handleUserLeave(payload: UserLeaveMessage): void {
    const { userId } = payload;
    useWhiteboardStore.getState().removeUser(userId);
    console.log(`User left: ${userId}`);
  }

  private handleUsers(payload: UsersMessage): void {
    const { users } = payload;
    const otherUsers = this.currentUser
      ? users.filter((u) => u.id !== this.currentUser.id)
      : users;
    useWhiteboardStore.getState().setUsers(otherUsers);
  }

  sendOperation(operation: Operation): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.currentUser) {
      operation.id = operation.id || uuidv4();
      operation.userId = this.currentUser.id;
      operation.lamport = crdtManager.getLocalLamport() + 1;
      crdtManager.addLocalOperation(operation);
      this.ws.send(
        JSON.stringify({
          type: 'operation',
          payload: { operation },
        })
      );
      this.refreshOperationsFromCRDT();
    }
  }

  sendCursor(position: Point): void {
    if (this.currentUser && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'cursor',
          payload: {
            userId: this.currentUser.id,
            position,
          },
        })
      );
    }
  }

  sendUndo(undoOf: string): void {
    if (!this.currentUser) return;

    const undoOp: Operation = {
      id: uuidv4(),
      userId: this.currentUser.id,
      lamport: crdtManager.getLocalLamport() + 1,
      type: 'undo',
      tool: 'pencil',
      color: '#000000',
      lineWidth: 0,
      timestamp: Date.now(),
      undoOf,
    };

    crdtManager.addLocalOperation(undoOp);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'operation',
          payload: { operation: undoOp },
        })
      );
    }

    this.refreshOperationsFromCRDT();
  }

  sendRedo(redoOf: string): void {
    if (!this.currentUser) return;

    const redoOp: Operation = {
      id: uuidv4(),
      userId: this.currentUser.id,
      lamport: crdtManager.getLocalLamport() + 1,
      type: 'redo',
      tool: 'pencil',
      color: '#000000',
      lineWidth: 0,
      timestamp: Date.now(),
      undoOf: redoOf,
    };

    crdtManager.addLocalOperation(redoOp);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'operation',
          payload: { operation: redoOp },
        })
      );
    }

    this.refreshOperationsFromCRDT();
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  subscribe(handler: (message: WSMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }
}

const wsManager = WebSocketManager.getInstance();

if (typeof window !== 'undefined') {
  wsManager.init();
}

export function useWebSocket() {
  const [isConnected, setIsConnectedState] = useState(wsManager.getIsConnected());
  const isConnectedRef = useRef(isConnected);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    const checkInterval = setInterval(() => {
      const connected = wsManager.getIsConnected();
      if (connected !== isConnectedRef.current) {
        setIsConnectedState(connected);
      }
    }, 200);

    return () => clearInterval(checkInterval);
  }, []);

  const sendOperation = useCallback((operation: Operation) => {
    wsManager.sendOperation(operation);
  }, []);

  const sendCursor = useCallback((position: Point) => {
    wsManager.sendCursor(position);
  }, []);

  const sendUndo = useCallback((undoOf: string) => {
    wsManager.sendUndo(undoOf);
  }, []);

  const sendRedo = useCallback((redoOf: string) => {
    wsManager.sendRedo(redoOf);
  }, []);

  const connect = useCallback(() => {
    wsManager.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsManager.disconnect();
  }, []);

  return {
    connect,
    disconnect,
    sendOperation,
    sendCursor,
    sendUndo,
    sendRedo,
    isConnected,
  };
}
