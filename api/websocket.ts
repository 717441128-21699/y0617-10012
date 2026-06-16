import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { store } from './store';
import type {
  Operation,
  User,
  WSMessage,
  InitMessage,
  OperationMessage,
  CursorMessage,
} from '../shared/types';

interface ExtendedWebSocket extends WebSocket {
  userId?: string;
}

const USER_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

const USER_NAMES = [
  '红队成员',
  '橙队成员',
  '黄队成员',
  '绿队成员',
  '青队成员',
  '蓝队成员',
  '紫队成员',
  '粉队成员',
];

let nextColorIndex = 0;

function getNextColor(): string {
  const color = USER_COLORS[nextColorIndex % USER_COLORS.length];
  nextColorIndex++;
  return color;
}

function getNextName(): string {
  const name = USER_NAMES[(nextColorIndex - 1) % USER_NAMES.length];
  return name;
}

function sendMessage(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(wss: WebSocketServer, type: string, payload: unknown, excludeUserId?: string): void {
  wss.clients.forEach((client) => {
    const extClient = client as ExtendedWebSocket;
    if (client.readyState === WebSocket.OPEN && extClient.userId !== excludeUserId) {
      client.send(JSON.stringify({ type, payload }));
    }
  });
}

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: ExtendedWebSocket) => {
    console.log('New WebSocket connection');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        handleMessage(ws, message, wss);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        const userId = ws.userId;
        const wasLastConnection = store.removeUser(userId);
        if (wasLastConnection) {
          broadcast(wss, 'user-leave', { userId });
          console.log(`User ${userId} disconnected (last connection)`);
        } else {
          console.log(`User ${userId} connection closed (still has other connections)`);
        }
        broadcast(wss, 'users', { users: store.getUsers() });
      }
    });
  });

  console.log('WebSocket server setup complete');
}

function handleMessage(ws: ExtendedWebSocket, message: WSMessage, wss: WebSocketServer): void {
  switch (message.type) {
    case 'init':
      handleInit(ws, message.payload as InitMessage, wss);
      break;
    case 'operation':
      handleOperation(ws, message.payload as OperationMessage, wss);
      break;
    case 'cursor':
      handleCursor(ws, message.payload as CursorMessage, wss);
      break;
    case 'ping':
      sendMessage(ws, 'pong', {});
      break;
  }
}

function handleInit(ws: ExtendedWebSocket, payload: InitMessage, wss: WebSocketServer): void {
  let userId = payload.userId || uuidv4();
  let color: string;
  let name: string;

  const existingUser = store.getUser(userId);
  if (existingUser) {
    color = existingUser.color;
    name = existingUser.name;
  } else {
    color = getNextColor();
    name = payload.userName || getNextName();
  }

  const user: User = {
    id: userId,
    name,
    color,
  };

  ws.userId = userId;
  const isNewUser = store.addUser(user);

  sendMessage(ws, 'history', {
    operations: store.getOperations(),
    users: store.getUsers(),
    currentUser: user,
  });

  if (isNewUser) {
    broadcast(wss, 'user-join', { user }, userId);
  }
  broadcast(wss, 'users', { users: store.getUsers() });

  console.log(`User ${userId} (${name}) initialized, new: ${isNewUser}`);
}

function handleOperation(ws: ExtendedWebSocket, payload: OperationMessage, wss: WebSocketServer): void {
  const { operation } = payload;

  if (store.hasOperation(operation.id)) {
    return;
  }

  const serverLamport = store.getMaxLamport();
  operation.lamport = Math.max(operation.lamport, serverLamport + 1);

  store.addOperation(operation);

  broadcast(wss, 'operation', { operation });

  if (ws.userId) {
    const user = store.getUser(ws.userId);
    if (user) {
      console.log(`User ${user.name} ${operation.type} operation: ${operation.tool}, lamport: ${operation.lamport}`);
    }
  }
}

function handleCursor(ws: ExtendedWebSocket, payload: CursorMessage, wss: WebSocketServer): void {
  const { userId, position } = payload;

  if (!userId || !position) return;

  store.updateUserCursor(userId, position);

  broadcast(wss, 'cursor', { userId, position }, userId);
}
