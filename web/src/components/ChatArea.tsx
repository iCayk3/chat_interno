import React, { useState, useEffect, useRef } from 'react';
import type { Conversation, Message } from '../types/chat';
import { Send, UserCheck, XCircle, MessageSquareOff, CheckCheck, Check, FileText, Download, Clock } from 'lucide-react';

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onAssign: () => void;
  onCloseChat: () => void;
  onTyping: (isTyping: boolean) => void;
  isClientTyping: boolean;
}

const QUICK_REPLIES = [
  'Olá! Como posso ajudar você hoje?',
  'Um instante por favor, estou consultando suas informações.',
  'Poderia me fornecer mais detalhes sobre o ocorrido?',
  'Obrigado pelo contato! Posso ajudar com mais alguma dúvida?',
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  messages,
  onSendMessage,
  onAssign,
  onCloseChat,
  onTyping,
  isClientTyping,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isClientTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (conversation?.status !== 'active') return;
    setInputText(e.target.value);
    onTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 1200);
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || !conversation || conversation.status !== 'active') return;

    onSendMessage(trimmed);
    setInputText('');
    onTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderMessageContent = (content: string, isOperator: boolean) => {
    const boletoMatch = content.match(/(\/api\/files\/boletos\/[^\s\)]+)/);
    if (!boletoMatch) {
      return <div className="break-words whitespace-pre-wrap">{content}</div>;
    }

    const fileUrl = boletoMatch[1];
    const textPart = content.replace(/\[Baixar Boleto PDF\]\([^)]+\)/g, '').trim();

    return (
      <div className="space-y-2.5">
        {textPart && (
          <div className="break-words whitespace-pre-wrap">{textPart}</div>
        )}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
            isOperator
              ? 'bg-blue-700/60 border-blue-400/40 text-white'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isOperator ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'
              }`}
            >
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs truncate block">
                Boleto Bancário (2ª Via Oficial)
              </span>
              <span
                className={`text-[10px] flex items-center gap-1 ${
                  isOperator ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                <Clock className="w-3 h-3" />
                Arquivo temporário (expira em 1h)
              </span>
            </div>
          </div>

          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-xs ${
              isOperator
                ? 'bg-white text-blue-700 hover:bg-blue-50'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar PDF</span>
          </a>
        </div>
      </div>
    );
  };

  if (!conversation) {
    return (
      <div className="flex-1 h-full bg-slate-50/50 flex flex-col items-center justify-center text-slate-400 select-none p-6">
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300 shadow-sm mb-4">
          <MessageSquareOff className="w-8 h-8" />
        </div>
        <h3 className="font-semibold text-slate-700 text-base">Nenhum atendimento selecionado</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
          Selecione uma conversa na barra lateral para iniciar o atendimento e responder em tempo real.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 min-w-0">
      {/* Header */}
      <div className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3 truncate">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
            {((conversation.contactName && conversation.contactName !== conversation.clientName)
              ? conversation.contactName
              : conversation.clientName
            ).charAt(0).toUpperCase()}
          </div>
          <div className="truncate">
            <h2 className="font-semibold text-slate-800 text-sm truncate flex items-center gap-2">
              <span>
                {conversation.contactName && conversation.contactName !== conversation.clientName
                  ? conversation.contactName
                  : conversation.clientName}
              </span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                conversation.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                conversation.status === 'waiting' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {conversation.status === 'waiting' ? 'Aguardando' : conversation.status === 'active' ? 'Em Atendimento' : 'Finalizado'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {conversation.contactName && conversation.contactName !== conversation.clientName ? (
                <>
                  <span className="text-slate-400">Titular:</span> <span className="font-medium text-slate-700">{conversation.clientName}</span>
                  {conversation.cpfCnpj && <span className="text-slate-400 font-mono ml-1">({conversation.cpfCnpj})</span>}
                  <span className="text-slate-300 mx-1.5">•</span>
                  <span>{conversation.department || 'Geral'}</span>
                </>
              ) : (
                <>
                  {conversation.cpfCnpj && <span className="font-mono text-slate-500">{conversation.cpfCnpj} • </span>}
                  {conversation.department || 'Suporte Geral'} • ID: {conversation.id}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {conversation.status === 'waiting' && (
            <button
              onClick={onAssign}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Assumir Atendimento</span>
            </button>
          )}

          {conversation.status !== 'closed' && (
            <button
              onClick={onCloseChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-medium text-xs transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Encerrar</span>
            </button>
          )}
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => {
          const isOperator = msg.senderType === 'operator';
          const isSystem = msg.senderType === 'system';

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="bg-amber-100/70 border border-amber-200 text-amber-800 text-xs px-3 py-1 rounded-full text-center max-w-md font-medium">
                  {msg.content}
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isOperator ? 'items-end' : 'items-start'}`}
            >
              <div className="text-[11px] text-slate-400 mb-1 px-1">
                {isOperator ? 'Você' : msg.senderName || 'Cliente'}
              </div>
              <div
                className={`max-w-xl px-4 py-2.5 rounded-2xl shadow-xs text-sm leading-relaxed ${
                  isOperator
                    ? 'bg-blue-600 text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                }`}
              >
                {renderMessageContent(msg.content, isOperator)}
                <div
                  className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                    isOperator ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  <span>{formatTime(msg.timestamp)}</span>
                  {isOperator && (
                    <span>
                      {msg.status === 'read' || msg.status === 'delivered' ? (
                        <CheckCheck className="w-3 h-3 text-blue-200 inline" />
                      ) : (
                        <Check className="w-3 h-3 text-blue-200 inline" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Client Typing Indicator */}
        {isClientTyping && (
          <div className="flex items-center gap-2 text-xs text-slate-500 italic bg-white/70 border border-slate-200/60 px-3 py-1.5 rounded-full w-fit animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            <span>Cliente está digitando...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies Bar */}
      {conversation.status === 'active' && (
        <div className="px-6 py-2 bg-slate-100/60 border-t border-slate-200 flex items-center gap-2 overflow-x-auto select-none">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0 uppercase tracking-wider">
            Respostas Rápidas:
          </span>
          {QUICK_REPLIES.map((reply, i) => (
            <button
              key={i}
              onClick={() => onSendMessage(reply)}
              className="text-xs px-2.5 py-1 bg-white hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg border border-slate-200 shrink-0 transition-colors"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="p-4 bg-white border-t border-slate-200">
        {conversation.status === 'closed' ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500 font-medium">
            Este atendimento foi encerrado. Nenhuma nova mensagem pode ser enviada.
          </div>
        ) : conversation.status === 'waiting' ? (
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-amber-900 truncate">
                  Atendimento em Espera na Fila
                </h4>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                  Você precisa assumir este atendimento para responder ou enviar mensagens ao cliente.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onAssign}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-2 transition-all shrink-0 cursor-pointer hover:shadow-md"
            >
              <UserCheck className="w-4 h-4" />
              <span>Assumir Atendimento</span>
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2 focus-within:border-blue-400 focus-within:bg-white transition-all shadow-inner">
            <textarea
              rows={2}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua resposta (Enter para enviar, Shift+Enter para nova linha)..."
              className="flex-1 bg-transparent border-0 focus:outline-none resize-none text-sm text-slate-800 placeholder-slate-400 p-1"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shadow-xs transition-all shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
