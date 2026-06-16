import { useEffect, useRef, useCallback } from 'react';
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

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualCloseRef = useRef(false);
  const currentUserRef = useRef<User | null>(null);

  const setCurrentUser = useWhiteboardStore((state) => state.setCurrentUser);
  const addUser = useWhiteboardStore((state) => state.addUser);
  const removeUser = useWhiteboardStore((state) => state.removeUser);
  const setUsers = useWhiteboardStore((state) => state.setUsers);
  const updateRemoteCursor = useWhiteboardStore((state) => state.updateRemoteCursor);
  const setIsConnected = useWhiteboardStore((state) => state.setIsConnected);
  const setOperations = useWhiteboardStore((state) => state.setOperations);
  const setUndoRedoStacks = useWhiteboardStore((state) => state.setUndoRedoStacks);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isManualCloseRef.current = false;

    try {
      const wsUrl = getWebSocketUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected to', wsUrl);
        setIsConnected(true);

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
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);

        if (!isManualCloseRef.current) {
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      scheduleReconnect();
    }
  }, [setIsConnected]);

  const disconnect = useCallback(() => {
    isManualCloseRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log('Attempting to reconnect...');
      connect();
    }, 3000);
  }, [connect]);

  const refreshOperationsFromCRDT = useCallback(() => {
    setOperations(crdtManager.getOperations());
    if (currentUserRef.current) {
      const { undoStack, redoStack } = crdtManager.getMyUndoRedoStacks(currentUserRef.current.id);
      setUndoRedoStacks(undoStack, redoStack);
    }
  }, [setOperations, setUndoRedoStacks]);

  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'history': {
          const payload = message.payload as HistoryMessage & { currentUser: User };
          handleHistory(payload);
          break;
        }
        case 'operation': {
          const payload = message.payload as OperationMessage;
          handleOperation(payload);
          break;
        }
        case 'cursor': {
          const payload = message.payload as CursorMessage;
          handleCursor(payload);
          break;
        }
        case 'user-join': {
          const payload = message.payload as UserJoinMessage;
          handleUserJoin(payload);
          break;
        }
        case 'user-leave': {
          const payload = message.payload as UserLeaveMessage;
          handleUserLeave(payload);
          break;
        }
        case 'users': {
          const payload = message.payload as UsersMessage;
          handleUsers(payload);
          break;
        }
      }
    },
    []
  );

  const handleHistory = useCallback(
    (payload: HistoryMessage & { currentUser: User }) => {
      const { operations, users, currentUser } = payload;

      localStorage.setItem('whiteboard_user_id', currentUser.id);
      localStorage.setItem('whiteboard_user_name', currentUser.name);

      currentUserRef.current = currentUser;
      setCurrentUser(currentUser);

      const otherUsers = users.filter((u) => u.id !== currentUser.id);
      setUsers(otherUsers);

      crdtManager.clear();
      operations.forEach((op) => {
        crdtManager.applyOperation(op);
      });

      refreshOperationsFromCRDT();

      console.log(`Loaded ${operations.length} operations from history for user ${currentUser.name}`);
    },
    [setCurrentUser, setUsers, refreshOperationsFromCRDT]
  );

  const handleOperation = useCallback(
    (payload: OperationMessage) => {
      const { operation } = payload;

      if (crdtManager.hasOperation(operation.id)) {
        return;
      }

      const applied = crdtManager.applyOperation(operation);
      if (applied) {
        refreshOperationsFromCRDT();
      }
    },
    [refreshOperationsFromCRDT]
  );

  const handleCursor = useCallback(
    (payload: CursorMessage) => {
      const { userId, position } = payload;
      if (currentUserRef.current && userId === currentUserRef.current.id) {
        return;
      }
      updateRemoteCursor(userId, position);
    },
    [updateRemoteCursor]
  );

  const handleUserJoin = useCallback(
    (payload: UserJoinMessage) => {
      const { user } = payload;
      if (currentUserRef.current && user.id === currentUserRef.current.id) {
        return;
      }
      addUser(user);
      console.log(`User joined: ${user.name}`);
    },
    [addUser]
  );

  const handleUserLeave = useCallback(
    (payload: UserLeaveMessage) => {
      const { userId } = payload;
      removeUser(userId);
      console.log(`User left: ${userId}`);
    },
    [removeUser]
  );

  const handleUsers = useCallback(
    (payload: UsersMessage) => {
      const { users } = payload;
      const otherUsers = currentUserRef.current
        ? users.filter((u) => u.id !== currentUserRef.current.id)
        : users;
      setUsers(otherUsers);
    },
    [setUsers]
  );

  const sendOperation = useCallback((operation: Operation) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      operation.id = operation.id || uuidv4();
      operation.lamport = crdtManager.getLocalLamport() + 1;
      crdtManager.addLocalOperation(operation);
      wsRef.current.send(
        JSON.stringify({
          type: 'operation',
          payload: { operation },
        })
      );
      refreshOperationsFromCRDT();
    }
  }, [refreshOperationsFromCRDT]);

  const sendCursor = useCallback((position: Point) => {
    if (currentUserRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'cursor',
          payload: {
            userId: currentUserRef.current.id,
            position,
          },
        })
      );
    }
  }, []);

  const sendUndo = useCallback((undoOf: string) => {
    if (!currentUserRef.current) return;

    const undoOp: Operation = {
      id: uuidv4(),
      userId: currentUserRef.current.id,
      lamport: crdtManager.getLocalLamport() + 1,
      type: 'undo',
      tool: 'pencil',
      color: '#000000',
      lineWidth: 0,
      timestamp: Date.now(),
      undoOf,
    };

    crdtManager.addLocalOperation(undoOp);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'operation',
          payload: { operation: undoOp },
        })
      );
    }

    refreshOperationsFromCRDT();
  }, [refreshOperationsFromCRDT]);

  const sendRedo = useCallback((redoOf: string) => {
    if (!currentUserRef.current) return;

    const redoOp: Operation = {
      id: uuidv4(),
      userId: currentUserRef.current.id,
      lamport: crdtManager.getLocalLamport() + 1,
      type: 'redo',
      tool: 'pencil',
      color: '#000000',
      lineWidth: 0,
      timestamp: Date.now(),
      undoOf: redoOf,
    };

    crdtManager.addLocalOperation(redoOp);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'operation',
          payload: { operation: redoOp },
        })
      );
    }

    refreshOperationsFromCRDT();
  }, [refreshOperationsFromCRDT]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const isConnected = useWhiteboardStore((state) => state.isConnected);

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
