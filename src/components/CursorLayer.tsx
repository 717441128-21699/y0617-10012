import React, { useEffect } from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';

export const CursorLayer: React.FC = () => {
  const { users, remoteCursors, viewOffset, viewScale, cleanupRemoteCursors } = useWhiteboardStore();

  useEffect(() => {
    const interval = setInterval(() => {
      cleanupRemoteCursors();
    }, 5000);
    return () => clearInterval(interval);
  }, [cleanupRemoteCursors]);

  const cursors = Array.from(remoteCursors.entries()).map(([userId, data]) => {
    const user = users.get(userId);
    if (!user) return null;

    return {
      userId,
      user,
      position: data.position,
      timestamp: data.timestamp,
    };
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {cursors.map((cursor) => {
        if (!cursor) return null;

        const { user, position } = cursor;
        const x = position.x * viewScale + viewOffset.x * viewScale;
        const y = position.y * viewScale + viewOffset.y * viewScale;

        return (
          <div
            key={cursor.userId}
            className="absolute transition-all duration-75 ease-out"
            style={{
              left: x,
              top: y,
              transform: 'translate(0, 0)',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: user.color }}
            >
              <path
                d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.86a.5.5 0 0 0-.85.35z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
            <div
              className="absolute left-5 top-4 px-2 py-0.5 rounded text-xs text-white font-medium whitespace-nowrap shadow-md"
              style={{ backgroundColor: user.color }}
            >
              {user.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};
