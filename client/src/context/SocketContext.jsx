import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const heartbeatRef = useRef(null);

  // 建立连接
  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[Socket] 已连接');
      setConnected(true);

      // 启动心跳（每 2 秒发送一次）
      heartbeatRef.current = setInterval(() => {
        socket.emit('heartbeat');
      }, 2000);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] 断开:', reason);
      setConnected(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] 连接错误:', err.message);
      setConnected(false);
    });

    socketRef.current = socket;

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user]);

  const getSocket = useCallback(() => socketRef.current, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, getSocket }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket 必须在 SocketProvider 内使用');
  return ctx;
}
