import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ChatBox({ messages, timerPhase, onSend }) {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const msgListRef = useRef(null);
  const inputRef = useRef(null);

  // 自动滚动到底部（仅滚动消息容器内，不影响页面）
  useEffect(() => {
    const el = msgListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // 根据计时器阶段决定是否可发言
  const canChat = timerPhase !== 'focusing';
  const isFocusing = timerPhase === 'focusing';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || !canChat) return;
    onSend(input.trim());
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-500">💬 消息</h3>
        {isFocusing && (
          <p className="text-xs text-amber-500 mt-1">🔇 专注期间消息已禁用</p>
        )}
      </div>

      {/* 消息列表 */}
      <div ref={msgListRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[400px]">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">
            {canChat ? '还没有消息，发一条打个招呼吧 👋' : '等待休息期可以发送消息'}
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId === user?.id || msg.nickname === user?.nickname;
          return (
            <div
              key={msg.id}
              className={`message-enter flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[75%] ${isMe ? 'order-1' : ''}`}>
                {!isMe && (
                  <p className="text-xs text-gray-400 ml-1 mb-0.5">{msg.nickname}</p>
                )}
                <div
                  className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-700 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isFocusing ? '专注期已禁言...' : '输入消息 (仅文字)'
            }
            disabled={!canChat}
            maxLength={500}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition"
          />
          <button
            type="submit"
            disabled={!canChat || !input.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}
