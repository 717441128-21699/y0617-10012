import React, { useRef, useEffect, useCallback } from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { DrawingTools } from '../tools/DrawingTools';
import type { Point, Operation } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

interface CanvasProps {
  className?: string;
}

export const Canvas: React.FC<CanvasProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingToolsRef = useRef<DrawingTools | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCursorSendRef = useRef<number>(0);
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef<Point | null>(null);

  const {
    currentTool,
    currentColor,
    currentLineWidth,
    isDrawing,
    startPoint,
    currentPoints,
    viewOffset,
    viewScale,
    operations,
    showTextInput,
    textInputPosition,
    currentText,
    currentUser,
    startDrawing,
    updateDrawing,
    endDrawing,
    cancelDrawing,
    setViewOffset,
    setViewScale,
    showTextInputAt,
    hideTextInput,
    setCurrentText,
  } = useWhiteboardStore();

  const { sendOperation, sendCursor, sendUndo, sendRedo } = useWebSocket();

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left - viewOffset.x * viewScale) / viewScale;
      const y = (clientY - rect.top - viewOffset.y * viewScale) / viewScale;
      return { x, y };
    },
    [viewOffset, viewScale]
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const tools = drawingToolsRef.current;
    if (!canvas || !tools) return;
    tools.redrawAll(operations, canvas.width, canvas.height, viewOffset, viewScale);
    if (isDrawing && currentPoints.length > 0) {
      tools.drawPreview(
        currentTool,
        currentPoints,
        startPoint,
        currentColor,
        currentLineWidth,
        viewOffset,
        viewScale
      );
    }
  }, [operations, isDrawing, currentPoints, startPoint, currentTool, currentColor, currentLineWidth, viewOffset, viewScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      redraw();
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawingToolsRef.current = new DrawingTools(ctx);
      redraw();
    }
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (showTextInput) {
        hideTextInput();
        return;
      }
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanningRef.current = true;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      const point = getCanvasPoint(e.clientX, e.clientY);
      if (currentTool === 'text') {
        showTextInputAt(point);
        return;
      }
      startDrawing(point);
    },
    [currentTool, getCanvasPoint, showTextInput, hideTextInput, startDrawing, showTextInputAt]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const now = Date.now();
      if (now - lastCursorSendRef.current > 50) {
        const point = getCanvasPoint(e.clientX, e.clientY);
        sendCursor(point);
        lastCursorSendRef.current = now;
      }
      if (isPanningRef.current && lastPanPointRef.current) {
        const dx = e.clientX - lastPanPointRef.current.x;
        const dy = e.clientY - lastPanPointRef.current.y;
        setViewOffset({
          x: viewOffset.x + dx / viewScale,
          y: viewOffset.y + dy / viewScale,
        });
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!isDrawing) return;
      const point = getCanvasPoint(e.clientX, e.clientY);
      updateDrawing(point);
    },
    [isDrawing, getCanvasPoint, updateDrawing, sendCursor, viewOffset, viewScale, setViewOffset]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      return;
    }
    if (!isDrawing) return;
    const op = endDrawing();
    if (op && currentUser) {
      const operation: Operation = {
        ...op,
        id: uuidv4(),
        userId: currentUser.id,
        lamport: 0,
      };
      sendOperation(operation);
    }
  }, [isDrawing, endDrawing, sendOperation, currentUser]);

  const handleMouseLeave = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      lastPanPointRef.current = null;
    }
    if (isDrawing) {
      cancelDrawing();
    }
  }, [isDrawing, cancelDrawing]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, viewScale * delta));
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const oldScale = viewScale;
        setViewOffset({
          x: viewOffset.x - (mouseX / newScale - mouseX / oldScale),
          y: viewOffset.y - (mouseY / newScale - mouseY / oldScale),
        });
      }
      setViewScale(newScale);
    },
    [viewScale, viewOffset, setViewScale, setViewOffset]
  );

  const handleTextSubmit = useCallback(() => {
    if (!currentText.trim() || !textInputPosition || !currentUser) {
      hideTextInput();
      return;
    }
    const operation: Operation = {
      id: uuidv4(),
      userId: currentUser.id,
      lamport: 0,
      type: 'draw',
      tool: 'text',
      text: currentText.trim(),
      position: textInputPosition,
      color: currentColor,
      lineWidth: currentLineWidth,
      timestamp: Date.now(),
    };
    sendOperation(operation);
    hideTextInput();
  }, [currentText, textInputPosition, currentUser, currentColor, currentLineWidth, sendOperation, hideTextInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleTextSubmit();
      } else if (e.key === 'Escape') {
        hideTextInput();
      }
    },
    [handleTextSubmit, hideTextInput]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          const redoOp = useWhiteboardStore.getState().redo();
          if (redoOp) {
            sendRedo(redoOp.id);
          }
        } else {
          const undoOp = useWhiteboardStore.getState().undo();
          if (undoOp) {
            sendUndo(undoOp.id);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sendUndo, sendRedo]);

  const cursorStyle = isPanningRef.current
    ? 'grabbing'
    : currentTool === 'text'
    ? 'text'
    : currentTool === 'eraser'
    ? 'cell'
    : 'crosshair';

  const textStyle: React.CSSProperties = {};
  if (showTextInput && textInputPosition) {
    textStyle.left = textInputPosition.x * viewScale + viewOffset.x * viewScale;
    textStyle.top = textInputPosition.y * viewScale + viewOffset.y * viewScale;
    textStyle.color = currentColor;
    textStyle.fontSize = 16 * viewScale;
  }

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden bg-white ${className || ''}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />
      {showTextInput && textInputPosition && (
        <input
          type="text"
          value={currentText}
          onChange={(e) => setCurrentText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleTextSubmit}
          autoFocus
          placeholder="输入文字..."
          className="absolute z-10 bg-transparent border-2 border-blue-500 rounded px-1 py-0.5 outline-none min-w-[100px]"
          style={textStyle}
        />
      )}
    </div>
  );
};
