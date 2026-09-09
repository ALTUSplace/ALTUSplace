import React, { useState } from 'react';
import { Bot, X, Send, Sparkles, MessageCircle, ArrowRight, Car, Building2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'سلام! مرحباً بك في ALTUSplace 🇲🇦. واش كتقلّب على كراء سيارة أوّلا عقار؟' }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [step, setStep] = useState<'category' | 'city' | 'budget' | 'done'>('category');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputVal;
    if (!text.trim()) return;

    const userMsg = { sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');

    setTimeout(() => {
      if (step === 'category') {
        const lower = text.toLowerCase();
        if (lower.includes('سيارة') || lower.includes('طوموبيل') || lower.includes('car')) {
          setSelectedCategory('سيارة');
          setStep('city');
          setMessages(prev => [...prev, { sender: 'ai', text: 'اختيار موفق! فإي مدينة بغيتي تكري السيارة؟ (مثال: الدار البيضاء، مراكش، طنجة، الرباط)' }]);
        } else if (lower.includes('عقار') || lower.includes('شقة') || lower.includes('فيلا') || lower.includes('appartement')) {
          setSelectedCategory('عقار');
          setStep('city');
          setMessages(prev => [...prev, { sender: 'ai', text: 'رائع جداً! فإي مدينة تبحث عن العقار؟ (مثال: الدار البيضاء، مراكش، أكادير)' }]);
        } else {
          setMessages(prev => [...prev, { sender: 'ai', text: 'عافاك واش كتقلّب على (سيارة) أو (عقار) باش نقترح عليك العروض المناسبة؟' }]);
        }
      } else if (step === 'city') {
        setSelectedCity(text);
        setStep('budget');
        setMessages(prev => [...prev, { sender: 'ai', text: `ممتاز في ${text}! شحال الميزانية اليومية التقريبية ديالك بالدرهم (MAD)؟` }]);
      } else if (step === 'budget') {
        setStep('done');
        const offerText = selectedCategory === 'سيارة' ? 
          '🚗 Dacia Logan 2025 (300 درهم/يوم) - متوفرة في الفوري.\n🚙 Range Rover Vogue 2024 (1500 درهم/يوم) - فاخرة.' :
          '🏢 شقة مودرن مطلة على البحر (1200 درهم/ليلة) - عين الذئاب.\n🏡 فيلا هادئة بمسبح خاص (2500 درهم/ليلة) - مراكش.';

        setMessages(prev => [
          ...prev, 
          { 
            sender: 'ai', 
            text: `لقد وجدنا لك عروضاً ممتازة لـ "${selectedCategory}" في مدينة "${selectedCity}" بـ "${text} درهم/اليوم"! إليك أبرز المقترحات المتاحة حالياً:\n\n${offerText}` 
          }
        ]);
      } else {
        setMessages(prev => [...prev, { sender: 'ai', text: 'هل ترغب في الانتقال لصفحة البحث المتقدم أو حجز هذا العرض مباشرة؟ يمكنك استخدام شريط البحث في الأعلى.' }]);
      }
    }, 600);
  };

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-[#0B0F19] hover:bg-[#0B0F19]/90 text-white p-4 rounded-full shadow-2xl flex items-center gap-3 transition-transform hover:scale-105 group border-2 border-amber-500"
          title="مساعد الذكاء الاصطناعي"
        >
          <Bot className="w-6 h-6 text-amber-400 animate-bounce" />
          <span className="hidden sm:inline font-bold text-sm tracking-wide">مساعد ALTUSplace الذكي</span>
          <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">AI</span>
        </button>
      )}

      {isOpen && (
        <div className="bg-white w-[350px] sm:w-[380px] h-[500px] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Chat Header */}
          <div className="bg-[#0B0F19] text-white p-4 flex items-center justify-between border-b border-amber-500/30">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-400">
                <Bot className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm">مساعد الذكاء الاصطناعي</h3>
                <p className="text-[10px] text-cyan-400 flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span> متصل الآن للاستشارة
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-xs sm:text-sm whitespace-pre-line leading-relaxed ${
                  msg.sender === 'user' ? 
                  'bg-[#0B0F19] text-white rounded-bl-none shadow-sm' : 
                  'bg-white text-slate-800 rounded-br-none shadow-sm border border-slate-100 font-medium'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Suggestions based on step */}
          {step === 'category' && (
            <div className="p-2 bg-white border-t border-slate-100 flex gap-2 justify-center">
              <Button size="sm" variant="outline" className="text-xs gap-1 border-amber-500 text-amber-700 hover:bg-amber-50" onClick={() => handleSend('كراء سيارة')}>
                <Car className="w-3.5 h-3.5" /> كراء سيارة
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1 border-blue-500 text-blue-700 hover:bg-blue-50" onClick={() => handleSend('كراء عقار')}>
                <Building2 className="w-3.5 h-3.5" /> كراء عقار
              </Button>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
            <Input 
              placeholder="اكتب ردك هنا..." 
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="text-xs sm:text-sm"
            />
            <Button size="icon" onClick={() => handleSend()} className="bg-[#0B0F19] hover:bg-[#0B0F19]/90 text-white shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>

        </div>
      )}
    </div>
  );
}
