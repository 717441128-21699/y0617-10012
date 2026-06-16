import type { Operation, Point } from '../../shared/types';

export interface OperationState {
  op: Operation;
  undone: boolean;
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

  incrementLamport(): number {
    this.localLamport++;
    return this.localLamport;
  }

  receiveLamport(remote: number): void {
    this.localLamport = Math.max(this.localLamport, remote) + 1;
  }

  hasOperation(id: string): boolean {
    return this.operations.has(id);
  }

  applyOperation(op: Operation): boolean {
    if (this.operations.has(op.id)) {
      return false;
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
    });

    if (op.type === 'draw') {
      this.operations.forEach((state, id) => {
        if (state.op.type === 'undo' && state.op.undoOf === op.id) {
          const targetState = this.operations.get(op.id);
          if (targetState) {
            targetState.undone = true;
          }
        } else if (state.op.type === 'redo' && state.op.undoOf === op.id) {
          const targetState = this.operations.get(op.id);
          if (targetState) {
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

  getOperations(): Operation[] {
    return Array.from(this.operations.values())
      .filter((state) => state.op.type === 'draw' && !state.undone)
      .map((state) => state.op)
      .sort((a, b) => {
        if (a.lamport !== b.lamport) {
          return a.lamport - b.lamport;
        }
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
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
      return a.timestamp - b.timestamp;
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
    this.incrementLamport();
    op.lamport = this.localLamport;
    this.applyOperation(op);
  }

  clear(): void {
    this.operations.clear();
    this.localLamport = 0;
  }

  getOperationById(id: string): Operation | undefined {
    return this.operations.get(id)?.op;
  }
}

export const crdtManager = new CRDTManager();
