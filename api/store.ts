import { Operation, User } from '../shared/types';

class Store {
  private operations: Map<string, Operation> = new Map();
  private operationOrder: string[] = [];
  private users: Map<string, User> = new Map();
  private maxLamport: number = 0;

  addOperation(op: Operation): void {
    if (this.operations.has(op.id)) {
      return;
    }
    this.operations.set(op.id, op);
    this.operationOrder.push(op.id);
    if (op.lamport > this.maxLamport) {
      this.maxLamport = op.lamport;
    }
  }

  getOperations(): Operation[] {
    return this.operationOrder
      .map(id => this.operations.get(id)!)
      .sort((a, b) => a.lamport - b.lamport);
  }

  getMaxLamport(): number {
    return this.maxLamport;
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }

  removeUser(userId: string): void {
    this.users.delete(userId);
  }

  updateUserCursor(userId: string, cursor: { x: number; y: number }): void {
    const user = this.users.get(userId);
    if (user) {
      user.cursor = cursor;
    }
  }

  getUsers(): User[] {
    return Array.from(this.users.values());
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  hasOperation(opId: string): boolean {
    return this.operations.has(opId);
  }
}

export const store = new Store();
