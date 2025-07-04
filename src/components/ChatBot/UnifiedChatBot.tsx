import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Plus, DollarSign, Target, CreditCard, Zap } from 'lucide-react';
import { AzureOpenAIService } from '../../lib/azureOpenAI';
import { DatabaseService } from '../../lib/database';
import { formatCurrency } from '../../lib/utils';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  action?: {
    type: 'create_lancamento' | 'create_meta' | 'create_conta';
    data: any;
    executed?: boolean;
  };
}

export function UnifiedChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Olá! Sou seu assistente financeiro inteligente. Posso ajudá-lo com:\n\n💬 Análises e consultas sobre suas finanças\n⚡ Comandos rápidos como "Gastei R$ 50 com alimentação"\n🎯 Criação de metas: "Criar meta de R$ 1000"\n🏦 Novas contas: "Criar conta poupança"\n\nComo posso ajudá-lo hoje?',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadData = async () => {
    try {
      const [categoriasData, contasData] = await Promise.all([
        DatabaseService.getCategorias(),
        DatabaseService.getContas()
      ]);
      setCategorias(categoriasData);
      setContas(contasData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const parseCommand = (message: string): { type: string; data?: any; message?: string } | null => {
    const msg = message.toLowerCase();

    // Padrões para criar lançamento
    const lancamentoPatterns = [
      /criar.*lançamento.*r?\$?\s*(\d+(?:,\d{2})?)\s*.*para\s*(.+)/i,
      /adicionar.*gasto.*r?\$?\s*(\d+(?:,\d{2})?)\s*.*em\s*(.+)/i,
      /registrar.*despesa.*r?\$?\s*(\d+(?:,\d{2})?)\s*.*categoria\s*(.+)/i,
      /gastei.*r?\$?\s*(\d+(?:,\d{2})?)\s*.*com\s*(.+)/i
    ];

    for (const pattern of lancamentoPatterns) {
      const match = message.match(pattern);
      if (match) {
        // Verificar se há contas disponíveis
        if (!contas || contas.length === 0) {
          return {
            type: 'error',
            message: 'Você precisa ter pelo menos uma conta cadastrada para criar um lançamento. Crie uma conta primeiro dizendo: "Criar conta corrente".'
          };
        }

        // Verificar se há categorias disponíveis
        if (!categorias || categorias.length === 0) {
          return {
            type: 'error',
            message: 'Você precisa ter pelo menos uma categoria cadastrada para criar um lançamento. As categorias são criadas automaticamente quando você cria seu perfil. Tente recarregar a página ou criar uma categoria manualmente.'
          };
        }

        const valor = parseFloat(match[1].replace(',', '.'));
        
        // Validar valor
        if (isNaN(valor) || valor <= 0) {
          return {
            type: 'error',
            message: 'O valor do lançamento deve ser um número positivo.'
          };
        }

        const descricao = match[2].trim();
        
        // Tentar encontrar categoria por nome
        let categoria = categorias.find(c => 
          c.nome.toLowerCase().includes(descricao.toLowerCase()) ||
          descricao.toLowerCase().includes(c.nome.toLowerCase())
        );

        // Se não encontrou categoria específica, usar categoria padrão de despesa
        if (!categoria) {
          categoria = categorias.find(c => c.tipo === 'DESPESA');
        }

        // Se ainda não encontrou, usar a primeira categoria disponível
        if (!categoria) {
          categoria = categorias[0];
        }

        // Verificação final de segurança
        if (!categoria || !categoria.id) {
          return {
            type: 'error',
            message: 'Não foi possível encontrar uma categoria válida. Verifique se você possui categorias cadastradas.'
          };
        }

        // Usar primeira conta ativa disponível
        const contaAtiva = contas.find(c => c.ativa !== false) || contas[0];

        // Verificação final de segurança para conta
        if (!contaAtiva || !contaAtiva.id) {
          return {
            type: 'error',
            message: 'Não foi possível encontrar uma conta válida. Verifique se você possui contas cadastradas.'
          };
        }

        return {
          type: 'create_lancamento',
          data: {
            descricao: `Gasto com ${descricao}`,
            valor,
            tipo: 'DESPESA',
            categoria_id: categoria.id,
            conta_id: contaAtiva.id,
            data: new Date().toISOString().split('T')[0]
          }
        };
      }
    }

    // Padrões para criar meta
    const metaPatterns = [
      /criar.*meta.*r?\$?\s*(\d+(?:,\d{2})?)/i,
      /definir.*objetivo.*r?\$?\s*(\d+(?:,\d{2})?)/i,
      /meta.*economia.*r?\$?\s*(\d+(?:,\d{2})?)/i
    ];

    for (const pattern of metaPatterns) {
      const match = message.match(pattern);
      if (match) {
        const valor = parseFloat(match[1].replace(',', '.'));
        
        // Validar valor da meta
        if (isNaN(valor) || valor <= 0) {
          return {
            type: 'error',
            message: 'O valor da meta deve ser um número positivo.'
          };
        }
        
        return {
          type: 'create_meta',
          data: {
            nome: 'Meta de Economia',
            tipo: 'ECONOMIA',
            valor_meta: valor,
            data_inicio: new Date().toISOString().split('T')[0],
            data_fim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 dias
          }
        };
      }
    }

    // Padrões para criar conta
    const contaPatterns = [
      /criar.*conta.*(.+)/i,
      /adicionar.*conta.*(.+)/i,
      /nova.*conta.*(.+)/i
    ];

    for (const pattern of contaPatterns) {
      const match = message.match(pattern);
      if (match) {
        const nome = match[1].trim();
        
        if (!nome || nome.length < 2) {
          return {
            type: 'error',
            message: 'O nome da conta deve ter pelo menos 2 caracteres.'
          };
        }
        
        return {
          type: 'create_conta',
          data: {
            nome,
            tipo: 'CORRENTE',
            saldo_inicial: 0
          }
        };
      }
    }

    return null;
  };

  const executeAction = async (action: { type: string; data: any }) => {
    try {
      switch (action.type) {
        case 'create_lancamento':
          await DatabaseService.createLancamento({
            ...action.data,
            status: 'CONFIRMADO'
          });
          return `✅ Lançamento criado: ${action.data.descricao} - ${formatCurrency(action.data.valor)}`;

        case 'create_meta':
          await DatabaseService.createMeta(action.data);
          return `🎯 Meta criada: ${action.data.nome} - ${formatCurrency(action.data.valor_meta)}`;

        case 'create_conta':
          await DatabaseService.createConta(action.data);
          return `🏦 Conta criada: ${action.data.nome}`;

        default:
          return 'Ação não reconhecida';
      }
    } catch (error) {
      console.error('Erro ao executar ação:', error);
      return '❌ Erro ao executar a ação. Tente novamente.';
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Verificar se é um comando executável
      const command = parseCommand(inputMessage);
      
      if (command) {
        if (command.type === 'error') {
          // Exibir mensagem de erro
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: `❌ ${command.message}`,
            sender: 'bot',
            timestamp: new Date()
          };

          setMessages(prev => [...prev, botMessage]);
        } else {
          // Executar ação
          const result = await executeAction(command);
          
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: result,
            sender: 'bot',
            timestamp: new Date(),
            action: { ...command, executed: true }
          };

          setMessages(prev => [...prev, botMessage]);
          
          // Recarregar dados após criar algo
          await loadData();
        }
      } else {
        // Resposta normal do chatbot usando IA
        const response = await AzureOpenAIService.getChatResponse(inputMessage);
        
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response,
          sender: 'bot',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'create_lancamento':
        return <DollarSign className="w-4 h-4 text-green-600" />;
      case 'create_meta':
        return <Target className="w-4 h-4 text-blue-600" />;
      case 'create_conta':
        return <CreditCard className="w-4 h-4 text-purple-600" />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center z-50 ${
          isOpen ? 'scale-0' : 'scale-100'
        }`}
      >
        <div className="relative">
          <MessageCircle className="w-6 h-6" />
          <Zap className="w-3 h-3 absolute -top-1 -right-1 text-yellow-300" />
        </div>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-t-2xl">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Assistente Financeiro IA</h3>
                <p className="text-xs text-blue-100">Chat inteligente + Comandos rápidos</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex items-start space-x-2 max-w-[80%] ${
                  message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.sender === 'user' 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {message.sender === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className={`px-4 py-2 rounded-2xl ${
                    message.sender === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    
                    {message.action && (
                      <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-gray-200">
                        {getActionIcon(message.action.type)}
                        <span className="text-xs font-medium">
                          {message.action.executed ? 'Executado' : 'Ação pendente'}
                        </span>
                      </div>
                    )}
                    
                    <p className={`text-xs mt-1 ${
                      message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {message.timestamp.toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-start space-x-2">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <Bot className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="bg-gray-100 px-4 py-2 rounded-2xl">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem ou comando..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className="px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            
            {/* Comandos de exemplo */}
            <div className="mt-2 text-xs text-gray-500">
              <p><strong>Comandos rápidos:</strong></p>
              <p>• "Gastei R$ 25 com alimentação"</p>
              <p>• "Criar meta de R$ 1000"</p>
              <p>• "Nova conta poupança"</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}