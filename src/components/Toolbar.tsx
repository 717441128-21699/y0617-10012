import React from 'react';
import {
  Pencil,
  Minus,
  Square,
  Circle,
  Type,
  Eraser,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Move,
} from 'lucide-react';
import { useWhiteboardStore, COLORS } from '../store/useWhiteboardStore';
import { useWebSocket } from '../hooks/useWebSocket';
import type { ToolType } from '../../shared/types';

const tools: { type: ToolType; icon: React.ReactNode; label: string }[] = [
  { type: 'pencil', icon: <Pencil size={20} />, label: '铅笔' },
  { type: 'line', icon: <Minus size={20} />, label: '直线' },
  { type: 'rect', icon: <Square size={20} />, label: '矩形' },
  { type: 'ellipse', icon: <Circle size={20} />, label: '椭圆' },
  { type: 'text', icon: <Type size={20} />, label: '文字' },
  { type: 'eraser', icon: <Eraser size={20} />, label: '橡皮擦' },
];

const lineWidths = [1, 2, 3, 5, 8, 12];

export const Toolbar: React.FC = () => {
  const {
    currentTool,
    currentColor,
    currentLineWidth,
    viewScale,
    undoStack,
    redoStack,
    setCurrentTool,
    setCurrentColor,
    setCurrentLineWidth,
    setViewScale,
    setViewOffset,
    undo,
    redo,
  } = useWhiteboardStore();

  const { sendUndo, sendRedo, isConnected } = useWebSocket();

  const handleUndo = () => {
    const undoOp = undo();
    if (undoOp) {
      sendUndo(undoOp.id);
    }
  };

  const handleRedo = () => {
    const redoOp = redo();
    if (redoOp) {
      sendRedo(redoOp.id);
    }
  };

  const handleZoomIn = () => {
    setViewScale(Math.min(5, viewScale * 1.2));
  };

  const handleZoomOut = () => {
    setViewScale(Math.max(0.1, viewScale / 1.2));
  };

  const handleResetView = () => {
    setViewScale(1);
    setViewOffset({ x: 0, y: 0 });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-20 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-800 mr-4">协作白板</h1>
          <div className="flex items-center gap-1 bg-gray-100 rounded-full px-1 py-1">
            {tools.map((tool) => (
              <button
                key={tool.type}
                onClick={() => setCurrentTool(tool.type)}
                title={tool.label}
                className={`p-2 rounded-full transition-all duration-200 ${
                  currentTool === tool.type
                    ? 'bg-blue-600 text-white shadow-md scale-105'
                    : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                {tool.icon}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-gray-300 mx-2" />

          <div className="flex items-center gap-1">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setCurrentColor(color)}
                title={color}
                className={`w-7 h-7 rounded-full border-2 transition-all duration-200 ${
                  currentColor === color
                    ? 'border-blue-600 scale-110 shadow-md'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <div className="w-px h-8 bg-gray-300 mx-2" />

          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500 mr-1">线宽:</span>
            {lineWidths.map((width) => (
              <button
                key={width}
                onClick={() => setCurrentLineWidth(width)}
                title={`${width}px`}
                className={`p-2 rounded transition-all duration-200 ${
                  currentLineWidth === width
                    ? 'bg-blue-100 text-blue-600'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <div
                  className="bg-current rounded-full"
                  style={{ width: width + 8, height: width + 8 }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
              title="缩小"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-sm font-medium text-gray-700 w-16 text-center">
              {Math.round(viewScale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
              title="放大"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={handleResetView}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors ml-1"
              title="重置视图"
            >
              <Move size={18} />
            </button>
          </div>

          <div className="w-px h-8 bg-gray-300 mx-1" />

          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`p-2 rounded-lg transition-all duration-200 ${
              undoStack.length > 0
                ? 'hover:bg-gray-100 text-gray-700'
                : 'text-gray-300 cursor-not-allowed'
            }`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={20} />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={`p-2 rounded-lg transition-all duration-200 ${
              redoStack.length > 0
                ? 'hover:bg-gray-100 text-gray-700'
                : 'text-gray-300 cursor-not-allowed'
            }`}
            title="重做 (Ctrl+Shift+Z)"
          >
            <Redo2 size={20} />
          </button>

          <div className="w-px h-8 bg-gray-300 mx-1" />

          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-gray-600">
              {isConnected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
