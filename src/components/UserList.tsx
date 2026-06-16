import React from 'react';
import { Users } from 'lucide-react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import type { User } from '../../shared/types';

export const UserList: React.FC = () => {
  const { users, currentUser } = useWhiteboardStore();

  const userMap = new Map<string, User>();
  if (currentUser) {
    userMap.set(currentUser.id, currentUser);
  }
  users.forEach((user) => {
    if (!userMap.has(user.id)) {
      userMap.set(user.id, user);
    }
  });
  const allUsers = Array.from(userMap.values());

  return (
    <div className="fixed left-4 top-20 z-20 bg-white rounded-lg shadow-lg border border-gray-200 w-56 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-gray-600" />
          <span className="font-medium text-gray-700">在线用户</span>
          <span className="ml-auto bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">
            {allUsers.length}
          </span>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {allUsers.map((user) => (
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
        {allUsers.length === 0 && (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">
            暂无在线用户
          </div>
        )}
      </div>
    </div>
  );
};
