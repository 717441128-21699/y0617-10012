import { useEffect, useCallback } from 'react';
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
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;
  private currentUser: User | null = null;
  private sessionId: string = '';
  private isConnected = false;
  private isConnecting = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatResponse = 0;
  private pendingQueue: Operation[] = [];

  init(): void {
    if (this.isConnected || this.isConnecting) {
      return;
    }
    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
      this.ws.close();
      this.ws = null;
    }
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

        if (!this.heartbeatTimer) {
          this.lastHeartbeatResponse = Date.now();
          this.heartbeatTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              if (Date.now() - this.lastHeartbeatResponse > 15000) {
                console.log('Heartbeat timeout, reconnecting...');
                this.forceDisconnect();
                this.scheduleReconnect();
                return;
              }
              this.ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 5000);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          if (message.type === 'pong') {
            this.lastHeartbeatResponse = Date.now();
            return;
          }
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
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

  forceDisconnect(): void {
    this.isManualClose = true;
    this.isConnecting = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
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
    useWhiteboardStore.getState().setIsConnected(false);
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

  private flushPendingQueue(): void {
    if (this.pendingQueue.length === 0) return;
    const queue = [...this.pendingQueue];
    this.pendingQueue = [];
    for (const op of queue) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'operation',
            payload: { operation: op },
          })
        );
      }
    }
    console.log(`Flushed ${queue.length} pending operations`);
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
        const payload = message.payload as HistoryMessage & { currentUser: User; sessionId: string };
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

  private handleHistory(payload: HistoryMessage & { currentUser: User; sessionId: string }): void {
    const { operations, users, currentUser, sessionId } = payload;

    localStorage.setItem('whiteboard_user_id', currentUser.id);
    localStorage.setItem('whiteboard_user_name', currentUser.name);

    this.currentUser = currentUser;
    this.sessionId = sessionId;
    useWhiteboardStore.getState().setCurrentUser(currentUser);

    const otherUsers = users.filter((u) => u.id !== currentUser.id);
    useWhiteboardStore.getState().setUsers(otherUsers);

    crdtManager.clear();
    operations.forEach((op) => {
      crdtManager.applyOperation(op);
    });

    this.refreshOperationsFromCRDT();
    this.flushPendingQueue();

    console.log(`Loaded ${operations.length} operations, session: ${sessionId.slice(0, 8)}`);
  }

  private handleOperation(payload: OperationMessage): void {
    const { operation } = payload;
    const changed = crdtManager.applyOperation(operation);
    if (changed) {
      this.refreshOperationsFromCRDT();
    }
  }

  private handleCursor(payload: CursorMessage): void {
    const { userId, sessionId: senderSessionId, position } = payload;
    if (senderSessionId === this.sessionId) {
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
  }

  private handleUserLeave(payload: UserLeaveMessage): void {
    const { userId } = payload;
    useWhiteboardStore.getState().removeUser(userId);
    useWhiteboardStore.getState().cleanupRemoteCursors();
  }

  private handleUsers(payload: UsersMessage): void {
    const { users } = payload;
    const otherUsers = this.currentUser
      ? users.filter((u) => u.id !== this.currentUser.id)
      : users;
    useWhiteboardStore.getState().setUsers(otherUsers);
  }

  private sendOrQueue(op: Operation): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'operation',
          payload: { operation: op },
        })
      );
    } else {
      this.pendingQueue.push(op);
      console.log(`Queued operation ${op.type} (offline), queue size: ${this.pendingQueue.length}`);
    }
  }

  sendOperation(operation: Operation): void {
    if (!this.currentUser) return;

    operation.id = operation.id || uuidv4();
    operation.userId = this.currentUser.id;
    operation.sessionId = this.sessionId;
    operation.lamport = 0;
    operation.timestamp = operation.timestamp || Date.now();

    this.sendOrQueue(operation);
  }

  sendCursor(position: Point): void {
    if (this.currentUser && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'cursor',
          payload: {
            userId: this.currentUser.id,
            sessionId: this.sessionId,
            position,
          },
        })
      );
    }
  }

  sendUndo(undoOf: string): void {
    if (!this.currentUser) return;
    if (!this.isConnected) return;

    const undoOp: Operation = {
      id: uuidv4(),
      userId: this.currentUser.id,
      sessionId: this.sessionId,
      lamport: 0,
      type: 'undo',
      tool: 'pencil',
      color: '#000000',
      lineWidth: 0,
      timestamp: Date.now(),
      undoOf,
    };

    this.sendOrQueue(undoOp);
  }

  sendRedo(redoOf: string): void {
    if (!this.currentUser) return;
    if (!this.isConnected) return;

    const redoOp: Operation = {
      id: uuidv4(),
      userId: this.currentUser.id,
      sessionId: this.sessionId,
      lamport: 0,
      type: 'redo',
      tool: 'pencil',
      color: '#000000',
      lineWidth: 0,
      timestamp: Date.now(),
      undoOf: redoOf,
    };

    this.sendOrQueue(redoOp);
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

const WS_KEY = '__whiteboard_ws_manager';

function getWSManager(): WebSocketManager {
  if (!(window as any)[WS_KEY]) {
    (window as any)[WS_KEY] = new WebSocketManager();
  }
  return (window as any)[WS_KEY];
}

const wsManager = getWSManager();

export function useWebSocket() {
  const isConnectedFromStore = useWhiteboardStore((state) => state.isConnected);

  useEffect(() => {
    wsManager.init();
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

  return {
    sendOperation,
    sendCursor,
    sendUndo,
    sendRedo,
    isConnected: isConnectedFromStore,
  };
}
