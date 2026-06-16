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

const isDev = import.meta.env.DEV;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = isDev
  ? 'ws://localhost:3001/ws'
  : `${WS_PROTOCOL}//${window.location.host}/ws`;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualCloseRef = useRef(false);

  const {
    setCurrentUser,
    addUser,
    removeUser,
    setUsers,
    updateRemoteCursor,
    setIsConnected,
    setOperations,
    addToUndoStack,
  } = useWhiteboardStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isManualCloseRef.current = false;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
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
        console.error('WebSocket readyState:', ws.readyState);
        console.error('WebSocket URL:', WS_URL);
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

      setCurrentUser(currentUser);
      setUsers(users.filter((u) => u.id !== currentUser.id));

      crdtManager.clear();
      operations.forEach((op) => {
        crdtManager.applyOperation(op);
      });

      setOperations(crdtManager.getOperations());

      const myOperations = operations.filter(
        (op) => op.userId === currentUser.id && op.type === 'draw'
      );
      myOperations.forEach((op) => addToUndoStack(op));

      console.log(`Loaded ${operations.length} operations from history`);
    },
    [setCurrentUser, setUsers, setOperations, addToUndoStack]
  );

  const handleOperation = useCallback(
    (payload: OperationMessage) => {
      const { operation } = payload;

      if (crdtManager.hasOperation(operation.id)) {
        return;
      }

      const applied = crdtManager.applyOperation(operation);
      if (applied) {
        setOperations(crdtManager.getOperations());

        const currentUser = useWhiteboardStore.getState().currentUser;
        if (currentUser && operation.userId === currentUser.id && operation.type === 'draw') {
          addToUndoStack(operation);
        }
      }
    },
    [setOperations, addToUndoStack]
  );

  const handleCursor = useCallback(
    (payload: CursorMessage) => {
      const { userId, position } = payload;
      updateRemoteCursor(userId, position);
    },
    [updateRemoteCursor]
  );

  const handleUserJoin = useCallback(
    (payload: UserJoinMessage) => {
      const { user } = payload;
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
      const currentUser = useWhiteboardStore.getState().currentUser;
      const otherUsers = currentUser ? users.filter((u) => u.id !== currentUser.id) : users;
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
    }
  }, []);

  const sendCursor = useCallback((position: Point) => {
    const currentUser = useWhiteboardStore.getState().currentUser;
    if (currentUser && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'cursor',
          payload: {
            userId: currentUser.id,
            position,
          },
        })
      );
    }
  }, []);

  const sendUndo = useCallback((undoOf: string) => {
    const currentUser = useWhiteboardStore.getState().currentUser;
    if (!currentUser) return;

    const undoOp: Operation = {
      id: uuidv4(),
      userId: currentUser.id,
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

    setOperations(crdtManager.getOperations());
  }, [setOperations]);

  const sendRedo = useCallback((redoOf: string) => {
    const currentUser = useWhiteboardStore.getState().currentUser;
    if (!currentUser) return;

    const redoOp: Operation = {
      id: uuidv4(),
      userId: currentUser.id,
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

    setOperations(crdtManager.getOperations());
  }, [setOperations]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connect,
    disconnect,
    sendOperation,
    sendCursor,
    sendUndo,
    sendRedo,
    isConnected: useWhiteboardStore((state) => state.isConnected),
  };
}
