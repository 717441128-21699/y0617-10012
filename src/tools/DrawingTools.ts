import type { Operation, Point } from '../../shared/types';

export class DrawingTools {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  clear(width: number, height: number): void {
    this.ctx.clearRect(0, 0, width, height);
  }

  drawGrid(width: number, height: number, offset: Point, scale: number): void {
    const gridSize = 20 * scale;
    const startX = -offset.x % gridSize;
    const startY = -offset.y % gridSize;

    this.ctx.strokeStyle = '#e5e7eb';
    this.ctx.lineWidth = 1;

    for (let x = startX; x < width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    for (let y = startY; y < height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }
  }

  drawOperation(op: Operation, offset: Point, scale: number): void {
    if (op.type !== 'draw') return;

    const adjustedOffset = {
      x: offset.x * scale,
      y: offset.y * scale,
    };

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    switch (op.tool) {
      case 'pencil':
        this.drawPencil(op, adjustedOffset, scale);
        break;
      case 'line':
        this.drawLine(op, adjustedOffset, scale);
        break;
      case 'rect':
        this.drawRect(op, adjustedOffset, scale);
        break;
      case 'ellipse':
        this.drawEllipse(op, adjustedOffset, scale);
        break;
      case 'text':
        this.drawText(op, adjustedOffset, scale);
        break;
      case 'eraser':
        this.drawEraser(op, adjustedOffset, scale);
        break;
    }

    this.ctx.restore();
  }

  private drawPencil(op: Operation, offset: Point, scale: number): void {
    if (!op.points || op.points.length < 2) return;

    this.ctx.strokeStyle = op.color;
    this.ctx.lineWidth = op.lineWidth * scale;
    this.ctx.globalCompositeOperation = 'source-over';

    this.ctx.beginPath();
    const firstPoint = op.points[0];
    this.ctx.moveTo(firstPoint.x * scale + offset.x, firstPoint.y * scale + offset.y);

    for (let i = 1; i < op.points.length; i++) {
      const point = op.points[i];
      this.ctx.lineTo(point.x * scale + offset.x, point.y * scale + offset.y);
    }
    this.ctx.stroke();
  }

  private drawLine(op: Operation, offset: Point, scale: number): void {
    if (!op.startPoint || !op.endPoint) return;

    this.ctx.strokeStyle = op.color;
    this.ctx.lineWidth = op.lineWidth * scale;
    this.ctx.globalCompositeOperation = 'source-over';

    this.ctx.beginPath();
    this.ctx.moveTo(
      op.startPoint.x * scale + offset.x,
      op.startPoint.y * scale + offset.y
    );
    this.ctx.lineTo(
      op.endPoint.x * scale + offset.x,
      op.endPoint.y * scale + offset.y
    );
    this.ctx.stroke();
  }

  private drawRect(op: Operation, offset: Point, scale: number): void {
    if (!op.startPoint || !op.endPoint) return;

    this.ctx.strokeStyle = op.color;
    this.ctx.lineWidth = op.lineWidth * scale;
    this.ctx.globalCompositeOperation = 'source-over';

    const x = Math.min(op.startPoint.x, op.endPoint.x) * scale + offset.x;
    const y = Math.min(op.startPoint.y, op.endPoint.y) * scale + offset.y;
    const width = Math.abs(op.endPoint.x - op.startPoint.x) * scale;
    const height = Math.abs(op.endPoint.y - op.startPoint.y) * scale;

    this.ctx.strokeRect(x, y, width, height);
  }

  private drawEllipse(op: Operation, offset: Point, scale: number): void {
    if (!op.startPoint || !op.endPoint) return;

    this.ctx.strokeStyle = op.color;
    this.ctx.lineWidth = op.lineWidth * scale;
    this.ctx.globalCompositeOperation = 'source-over';

    const centerX = ((op.startPoint.x + op.endPoint.x) / 2) * scale + offset.x;
    const centerY = ((op.startPoint.y + op.endPoint.y) / 2) * scale + offset.y;
    const radiusX = Math.abs(op.endPoint.x - op.startPoint.x) / 2 * scale;
    const radiusY = Math.abs(op.endPoint.y - op.startPoint.y) / 2 * scale;

    this.ctx.beginPath();
    this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private drawText(op: Operation, offset: Point, scale: number): void {
    if (!op.text || !op.position) return;

    this.ctx.fillStyle = op.color;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.font = `${16 * scale}px "Noto Sans SC", sans-serif`;
    this.ctx.textBaseline = 'top';

    const x = op.position.x * scale + offset.x;
    const y = op.position.y * scale + offset.y;

    this.ctx.fillText(op.text, x, y);
  }

  private drawEraser(op: Operation, offset: Point, scale: number): void {
    if (!op.points || op.points.length < 2) return;

    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.lineWidth = (op.lineWidth * 3) * scale;

    this.ctx.beginPath();
    const firstPoint = op.points[0];
    this.ctx.moveTo(firstPoint.x * scale + offset.x, firstPoint.y * scale + offset.y);

    for (let i = 1; i < op.points.length; i++) {
      const point = op.points[i];
      this.ctx.lineTo(point.x * scale + offset.x, point.y * scale + offset.y);
    }
    this.ctx.stroke();
  }

  drawPreview(
    tool: string,
    points: Point[],
    startPoint: Point | null,
    color: string,
    lineWidth: number,
    offset: Point,
    scale: number
  ): void {
    if (points.length === 0 && !startPoint) return;

    const adjustedOffset = {
      x: offset.x * scale,
      y: offset.y * scale,
    };

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth * scale;

    switch (tool) {
      case 'pencil':
      case 'eraser':
        if (points.length < 2) break;
        if (tool === 'eraser') {
          this.ctx.globalCompositeOperation = 'destination-out';
          this.ctx.lineWidth = (lineWidth * 3) * scale;
        } else {
          this.ctx.globalCompositeOperation = 'source-over';
        }
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x * scale + adjustedOffset.x, points[0].y * scale + adjustedOffset.y);
        for (let i = 1; i < points.length; i++) {
          this.ctx.lineTo(points[i].x * scale + adjustedOffset.x, points[i].y * scale + adjustedOffset.y);
        }
        this.ctx.stroke();
        break;

      case 'line':
        if (!startPoint || points.length === 0) break;
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.beginPath();
        this.ctx.moveTo(startPoint.x * scale + adjustedOffset.x, startPoint.y * scale + adjustedOffset.y);
        this.ctx.lineTo(
          points[points.length - 1].x * scale + adjustedOffset.x,
          points[points.length - 1].y * scale + adjustedOffset.y
        );
        this.ctx.stroke();
        break;

      case 'rect':
        if (!startPoint || points.length === 0) break;
        this.ctx.globalCompositeOperation = 'source-over';
        const endPoint = points[points.length - 1];
        const x = Math.min(startPoint.x, endPoint.x) * scale + adjustedOffset.x;
        const y = Math.min(startPoint.y, endPoint.y) * scale + adjustedOffset.y;
        const width = Math.abs(endPoint.x - startPoint.x) * scale;
        const height = Math.abs(endPoint.y - startPoint.y) * scale;
        this.ctx.strokeRect(x, y, width, height);
        break;

      case 'ellipse':
        if (!startPoint || points.length === 0) break;
        this.ctx.globalCompositeOperation = 'source-over';
        const ep = points[points.length - 1];
        const cx = ((startPoint.x + ep.x) / 2) * scale + adjustedOffset.x;
        const cy = ((startPoint.y + ep.y) / 2) * scale + adjustedOffset.y;
        const rx = Math.abs(ep.x - startPoint.x) / 2 * scale;
        const ry = Math.abs(ep.y - startPoint.y) / 2 * scale;
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        break;
    }

    this.ctx.restore();
  }

  redrawAll(
    operations: Operation[],
    width: number,
    height: number,
    offset: Point,
    scale: number
  ): void {
    this.clear(width, height);
    this.drawGrid(width, height, offset, scale);

    const sortedOps = [...operations].sort((a, b) => a.lamport - b.lamport);

    for (const op of sortedOps) {
      this.drawOperation(op, offset, scale);
    }
  }
}
