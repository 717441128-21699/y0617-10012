import React from 'react';
import { Toolbar } from '../components/Toolbar';
import { Canvas } from '../components/Canvas';
import { UserList } from '../components/UserList';
import { CursorLayer } from '../components/CursorLayer';
import { useWebSocket } from '../hooks/useWebSocket';

const Home: React.FC = () => {
  useWebSocket();

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-100">
      <Toolbar />
      <div className="pt-14 h-full relative">
        <Canvas className="h-full" />
        <CursorLayer />
      </div>
      <UserList />

      <div className="fixed bottom-4 right-4 z-20 bg-white rounded-lg shadow-lg px-4 py-3 text-sm text-gray-600 border border-gray-200">
        <div className="font-medium text-gray-700 mb-1">操作提示</div>
        <div className="space-y-0.5 text-xs">
          <div>• 按住 Alt + 左键拖动：平移画布</div>
          <div>• 鼠标滚轮：缩放画布</div>
          <div>• Ctrl+Z：撤销，Ctrl+Shift+Z：重做</div>
        </div>
      </div>
    </div>
  );
};

export default Home;
