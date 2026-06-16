export type ToolType = 'pencil' | 'line' | 'rect' | 'ellipse' | 'text' | 'eraser';

export interface Point {
  x: number;
  y: number;
}

export interface Operation {
  id: string;
  userId: string;
  sessionId: string;
  lamport: number;
  type: 'draw' | 'undo' | 'redo';
  tool: ToolType;
  points?: Point[];
  startPoint?: Point;
  endPoint?: Point;
  text?: string;
  position?: Point;
  color: string;
  lineWidth: number;
  timestamp: number;
  undoOf?: string;
}

export interface User {
  id: string;
  name: string;
  color: string;
  cursor?: Point;
}

export type MessageType =
  | 'init'
  | 'history'
  | 'operation'
  | 'cursor'
  | 'user-join'
  | 'user-leave'
  | 'users'
  | 'sync'
  | 'ping'
  | 'pong';

export interface WSMessage<T = unknown> {
  type: MessageType;
  payload: T;
}

export interface InitMessage {
  userId: string;
  userName: string;
}

export interface HistoryMessage {
  operations: Operation[];
  users: User[];
  sessionId: string;
}

export interface OperationMessage {
  operation: Operation;
}

export interface CursorMessage {
  userId: string;
  sessionId: string;
  position: Point;
}

export interface UserJoinMessage {
  user: User;
}

export interface UserLeaveMessage {
  userId: string;
}

export interface UsersMessage {
  users: User[];
}

export interface SyncMessage {
  operations: Operation[];
}
