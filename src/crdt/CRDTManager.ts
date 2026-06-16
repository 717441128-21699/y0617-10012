import type { Operation, Point } from '../../shared/types';

export class CRDTManager {
  private operations: Map<string, Operation> = new Map();
  private operationOrder: string[] = [];
  private localLamport: number = 0;
  private undoStack: Operation[] = [];
  private redoStack: Operation[] = [];
  private onOperationApplied: ((op: Operation) => void) | null = null;

  setOnOperationApplied(callback: (op: Operation) => void): void {
    this.onOperationApplied = callback;
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

    this.operations.set(op.id, op);

    if (op.type === 'undo' && op.undoOf) {
      const index = this.operationOrder.indexOf(op.undoOf);
      if (index !== -1) {
        this.operationOrder.splice(index, 0, op.id);
      } else {
        this.operationOrder.push(op.id);
      }
    } else if (op.type === 'redo' && op.undoOf) {
      const undoIndex = this.operationOrder.findIndex(id => {
        const o = this.operations.get(id);
        return o && o.type === 'undo' && o.undoOf === op.undoOf;
      });
      if (undoIndex !== -1) {
        this.operationOrder.splice(undoIndex + 1, 0, op.id);
      } else {
        this.operationOrder.push(op.id);
      }
    } else {
      this.operationOrder.push(op.id);
    }

    if (this.onOperationApplied) {
      this.onOperationApplied(op);
    }

    return true;
  }

  getOperations(): Operation[] {
    return this.operationOrder
      .map(id => this.operations.get(id)!)
      .filter(op => !this.isUndone(op.id))
      .sort((a, b) => a.lamport - b.lamport);
  }

  private isUndone(opId: string): boolean {
    const undoOp = Array.from(this.operations.values()).find(
      op => op.type === 'undo' && op.undoOf === opId
    );
    if (!undoOp) return false;

    const redoOp = Array.from(this.operations.values()).find(
      op => op.type === 'redo' && op.undoOf === opId
    );
    if (redoOp && redoOp.lamport > undoOp.lamport) return false;

    return true;
  }

  addLocalOperation(op: Operation): void {
    this.incrementLamport();
    op.lamport = this.localLamport;
    this.applyOperation(op);

    if (op.type === 'draw') {
      this.undoStack.push(op);
      this.redoStack = [];
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoStack(): Operation[] {
    return [...this.undoStack];
  }

  getRedoStack(): Operation[] {
    return [...this.redoStack];
  }

  clear(): void {
    this.operations.clear();
    this.operationOrder = [];
    this.undoStack = [];
    this.redoStack = [];
    this.localLamport = 0;
  }

  getOperationById(id: string): Operation | undefined {
    return this.operations.get(id);
  }
}

export const crdtManager = new CRDTManager();
