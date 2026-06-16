import { create } from 'zustand';
import type { ToolType, Operation, User, Point } from '../../shared/types';

interface WhiteboardState {
  currentUser: User | null;
  users: Map<string, User>;
  remoteCursors: Map<string, { position: Point; timestamp: number }>;
  currentTool: ToolType;
  currentColor: string;
  currentLineWidth: number;
  currentText: string;
  isDrawing: boolean;
  startPoint: Point | null;
  currentPoints: Point[];
  viewOffset: Point;
  viewScale: number;
  operations: Operation[];
  undoStack: Operation[];
  redoStack: Operation[];
  isConnected: boolean;
  textInputPosition: Point | null;
  showTextInput: boolean;

  setCurrentUser: (user: User) => void;
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;
  setUsers: (users: User[]) => void;
  updateRemoteCursor: (userId: string, position: Point) => void;
  cleanupRemoteCursors: () => void;

  setCurrentTool: (tool: ToolType) => void;
  setCurrentColor: (color: string) => void;
  setCurrentLineWidth: (width: number) => void;
  setCurrentText: (text: string) => void;

  startDrawing: (point: Point) => void;
  updateDrawing: (point: Point) => void;
  endDrawing: () => Operation | null;
  cancelDrawing: () => void;

  setViewOffset: (offset: Point) => void;
  setViewScale: (scale: number) => void;

  addOperation: (op: Operation) => void;
  setOperations: (ops: Operation[]) => void;
  undo: () => Operation | null;
  redo: () => Operation | null;
  addToUndoStack: (op: Operation) => void;

  setIsConnected: (connected: boolean) => void;

  showTextInputAt: (position: Point) => void;
  hideTextInput: () => void;

  reset: () => void;
}

const COLORS = [
  '#000000',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
];

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  currentUser: null,
  users: new Map(),
  remoteCursors: new Map(),
  currentTool: 'pencil',
  currentColor: COLORS[0],
  currentLineWidth: 3,
  currentText: '',
  isDrawing: false,
  startPoint: null,
  currentPoints: [],
  viewOffset: { x: 0, y: 0 },
  viewScale: 1,
  operations: [],
  undoStack: [],
  redoStack: [],
  isConnected: false,
  textInputPosition: null,
  showTextInput: false,

  setCurrentUser: (user) => set({ currentUser: user }),

  addUser: (user) =>
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.set(user.id, user);
      return { users: newUsers };
    }),

  removeUser: (userId) =>
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.delete(userId);
      const newCursors = new Map(state.remoteCursors);
      newCursors.delete(userId);
      return { users: newUsers, remoteCursors: newCursors };
    }),

  setUsers: (users) =>
    set(() => {
      const newUsers = new Map<string, User>();
      users.forEach((user) => newUsers.set(user.id, user));
      return { users: newUsers };
    }),

  updateRemoteCursor: (userId, position) =>
    set((state) => {
      const newCursors = new Map(state.remoteCursors);
      newCursors.set(userId, { position, timestamp: Date.now() });
      return { remoteCursors: newCursors };
    }),

  cleanupRemoteCursors: () =>
    set((state) => {
      const now = Date.now();
      const newCursors = new Map(state.remoteCursors);
      newCursors.forEach((data, userId) => {
        if (now - data.timestamp > 10000) {
          newCursors.delete(userId);
        }
      });
      return { remoteCursors: newCursors };
    }),

  setCurrentTool: (tool) => set({ currentTool: tool, showTextInput: false }),
  setCurrentColor: (color) => set({ currentColor: color }),
  setCurrentLineWidth: (width) => set({ currentLineWidth: width }),
  setCurrentText: (text) => set({ currentText: text }),

  startDrawing: (point) =>
    set({
      isDrawing: true,
      startPoint: point,
      currentPoints: [point],
    }),

  updateDrawing: (point) =>
    set((state) => {
      if (!state.isDrawing) return {};
      return {
        currentPoints: [...state.currentPoints, point],
      };
    }),

  endDrawing: () => {
    const state = get();
    if (!state.isDrawing || !state.currentUser) return null;

    const tool = state.currentTool;
    const op: Partial<Operation> = {
      userId: state.currentUser.id,
      type: 'draw',
      tool,
      color: state.currentColor,
      lineWidth: state.currentLineWidth,
      timestamp: Date.now(),
    };

    if (tool === 'pencil' || tool === 'eraser') {
      if (state.currentPoints.length < 2) {
        set({ isDrawing: false, startPoint: null, currentPoints: [] });
        return null;
      }
      op.points = state.currentPoints;
    } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      if (!state.startPoint || state.currentPoints.length < 1) {
        set({ isDrawing: false, startPoint: null, currentPoints: [] });
        return null;
      }
      op.startPoint = state.startPoint;
      op.endPoint = state.currentPoints[state.currentPoints.length - 1];
    }

    set({
      isDrawing: false,
      startPoint: null,
      currentPoints: [],
    });

    return op as Operation;
  },

  cancelDrawing: () =>
    set({
      isDrawing: false,
      startPoint: null,
      currentPoints: [],
    }),

  setViewOffset: (offset) => set({ viewOffset: offset }),
  setViewScale: (scale) => set({ viewScale: scale }),

  addOperation: (op) =>
    set((state) => ({
      operations: [...state.operations, op],
    })),

  setOperations: (ops) => set({ operations: ops }),

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return null;

    const undoOp = state.undoStack[state.undoStack.length - 1];
    const newUndoStack = state.undoStack.slice(0, -1);
    const newRedoStack = [...state.redoStack, undoOp];

    set({
      undoStack: newUndoStack,
      redoStack: newRedoStack,
    });

    return undoOp;
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return null;

    const redoOp = state.redoStack[state.redoStack.length - 1];
    const newRedoStack = state.redoStack.slice(0, -1);
    const newUndoStack = [...state.undoStack, redoOp];

    set({
      undoStack: newUndoStack,
      redoStack: newRedoStack,
    });

    return redoOp;
  },

  addToUndoStack: (op) =>
    set((state) => ({
      undoStack: [...state.undoStack, op],
      redoStack: [],
    })),

  setIsConnected: (connected) => set({ isConnected: connected }),

  showTextInputAt: (position) =>
    set({
      textInputPosition: position,
      showTextInput: true,
    }),

  hideTextInput: () =>
    set({
      showTextInput: false,
      textInputPosition: null,
      currentText: '',
    }),

  reset: () =>
    set({
      operations: [],
      undoStack: [],
      redoStack: [],
      isDrawing: false,
      startPoint: null,
      currentPoints: [],
    }),
}));

export { COLORS };
