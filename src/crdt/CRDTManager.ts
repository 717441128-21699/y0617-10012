import type { Operation, Point } from '../../shared/types';

export interface OperationState {
  op: Operation;
  undone: boolean;
  confirmed: boolean;
}

export class CRDTManager {
  private operations: Map<string, OperationState> = new Map();
  private localLamport: number = 0;
  private onOperationsChanged: (() => void) | null = null;

  setOnOperationsChanged(callback: () => void): void {
    this.onOperationsChanged = callback;
  }

  getLocalLamport(): number {
    return this.localLamport;
  }

  receiveLamport(remote: number): void {
    this.localLamport = Math.max(this.localLamport, remote) + 1;
  }

  hasOperation(id: string): boolean {
    return this.operations.has(id);
  }

  applyOperation(op: Operation, confirmed: boolean = false): boolean {
    const existing = this.operations.get(op.id);

    if (existing) {
      let changed = false;

      if (confirmed && !existing.confirmed) {
        existing.confirmed = true;
        changed = true;
      }

      if (op.lamport > existing.op.lamport) {
        existing.op = { ...existing.op, lamport: op.lamport };
        this.receiveLamport(op.lamport);
        changed = true;
      }

      if (op.type === 'undo' && op.undoOf) {
        const targetState = this.operations.get(op.undoOf);
        if (targetState && !targetState.undone) {
          targetState.undone = true;
          changed = true;
        }
      } else if (op.type === 'redo' && op.undoOf) {
        const targetState = this.operations.get(op.undoOf);
        if (targetState && targetState.undone) {
          targetState.undone = false;
          changed = true;
        }
      }

      if (changed && this.onOperationsChanged) {
        this.onOperationsChanged();
      }

      return changed;
    }

    this.receiveLamport(op.lamport);

    if (op.type === 'undo' && op.undoOf) {
      const targetState = this.operations.get(op.undoOf);
      if (targetState) {
        targetState.undone = true;
      }
    } else if (op.type === 'redo' && op.undoOf) {
      const targetState = this.operations.get(op.undoOf);
      if (targetState) {
        targetState.undone = false;
      }
    }

    this.operations.set(op.id, {
      op,
      undone: false,
      confirmed,
    });

    if (op.type === 'draw') {
      this.operations.forEach((state) => {
        if (state.op.type === 'undo' && state.op.undoOf === op.id && !op.undoOf) {
          const targetState = this.operations.get(op.id);
          if (targetState && !targetState.undone) {
            targetState.undone = true;
          }
        } else if (state.op.type === 'redo' && state.op.undoOf === op.id && !op.undoOf) {
          const targetState = this.operations.get(op.id);
          if (targetState && targetState.undone) {
            targetState.undone = false;
          }
        }
      });
    }

    if (this.onOperationsChanged) {
      this.onOperationsChanged();
    }

    return true;
  }

  confirmOperation(op: Operation): boolean {
    return this.applyOperation(op, true);
  }

  getOperations(): Operation[] {
    return Array.from(this.operations.values())
      .filter((state) => state.op.type === 'draw' && !state.undone)
      .map((state) => state.op)
      .sort((a, b) => {
        if (a.lamport !== b.lamport) return a.lamport - b.lamport;
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.id.localeCompare(b.id);
      });
  }

  isOperationUndone(opId: string): boolean {
    const state = this.operations.get(opId);
    return state?.undone ?? false;
  }

  getMyUndoRedoStacks(userId: string): { undoStack: Operation[]; redoStack: Operation[] } {
    const myDrawOps: Operation[] = [];

    this.operations.forEach((state) => {
      if (state.op.type === 'draw' && state.op.userId === userId) {
        myDrawOps.push(state.op);
      }
    });

    myDrawOps.sort((a, b) => {
      if (a.lamport !== b.lamport) return a.lamport - b.lamport;
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.id.localeCompare(b.id);
    });

    const undoStack: Operation[] = [];
    const redoStack: Operation[] = [];

    for (const drawOp of myDrawOps) {
      if (this.isOperationUndone(drawOp.id)) {
        redoStack.push(drawOp);
      } else {
        undoStack.push(drawOp);
      }
    }

    return { undoStack, redoStack };
  }

  addLocalOperation(op: Operation): void {
    this.localLamport++;
    op.lamport = this.localLamport;
    this.applyOperation(op, false);
  }

  clear(): void {
    this.operations.clear();
    this.localLamport = 0;
  }

  getOperationById(id: string): Operation | undefined {
    return this.operations.get(id)?.op;
  }
}

const CRDT_KEY = '__whiteboard_crdt_manager';

function getCRDTManager(): CRDTManager {
  if (!(window as any)[CRDT_KEY]) {
    (window as any)[CRDT_KEY] = new CRDTManager();
  }
  return (window as any)[CRDT_KEY];
}

export const crdtManager = getCRDTManager();
