import React from 'react';
import { Users } from 'lucide-react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import type { User } from '../../shared/types';

export const UserList: React.FC = () => {
  const { users, currentUser, isConnected } = useWhiteboardStore();

  const remoteUsers: User[] = [];
  users.forEach((user, id) => {
    if (id !== currentUser?.id) {
      remoteUsers.push(user);
    }
  });

  const displayUsers = currentUser ? [currentUser, ...remoteUsers] : remoteUsers;

  return (
    <div className="fixed left-4 top-20 z-20 bg-white rounded-lg shadow-lg border border-gray-200 w-56 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-gray-600" />
          <span className="font-medium text-gray-700">在线用户</span>
          <span className="ml-auto bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">
            {displayUsers.length}
          </span>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {displayUsers.map((user) => (
          <div
            key={user.id}
            className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0 transition-colors ${
              user.id === currentUser?.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shadow-sm"
              style={{ backgroundColor: user.color }}
            >
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">
                {user.name}
              </div>
              <div className="text-xs text-gray-500">
                {user.id === currentUser?.id ? '（你）' : '在线'}
              </div>
            </div>
            <div
              className="w-3 h-3 rounded-full shadow-inner"
              style={{ backgroundColor: user.color }}
            />
          </div>
        ))}
        {displayUsers.length === 0 && (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">
            暂无在线用户
          </div>
        )}
      </div>
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`}
        />
        <span className="text-xs text-gray-500">
          {isConnected ? '连接正常' : '连接断开'}
        </span>
      </div>
    </div>
  );
};
