import React from 'react';
import { Link } from 'wouter';
import { BookOpen, Calendar, User, ArrowRight, Sparkles, Tag, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from "@/contexts/LanguageContext";

export default function BlogPage() {
  const { direction } = useLanguage();
  const articles = [
    {
      id: 1,
      title: 'دليلك الشامل لكراء السيارات في الدار البيضاء ومراكش 2026',
      excerpt: 'تعرف على أهم النصائح القانونية والتقنية لتأجير السيارات بكل أمان في المدن الكبرى بالمغرب، وكيفية تجنب الرسوم الخفية.',
      category: 'دليل السفر',
      date: '21 أغسطس 2026',
      author: 'فريق التحرير ALTUSplace',
      image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800',
      readTime: '5 دقائق قراءة'
    },
    {
      id: 2,
      title: 'أفضل المناطق الاستثمارية العقارية في طنجة وأغادير',
      excerpt: 'استعراض لأهم الأحياء المطلة على البحر والتي تشهد إقبالاً كبيرًا من السياح والمستثمرين خلال موسم الصيف والعطلات.',
      category: 'استثمار عقاري',
      date: '18 أغسطس 2026',
      author: 'خالد المنصوري',
      image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800',
      readTime: '7 دقائق قراءة'
    },
    {
      id: 3,
      title: 'كيف تختار السيارة المناسبة لرحلتك العائلية عبر الطرق السيارة؟',
      excerpt: 'مقارنة شاملة بين سيارات الـ SUV والاقتصادية والفاخرة لضمان أقصى درجات الراحة والأمان لك ولعائلتك.',
      category: 'نصائح قيادة',
      date: '15 أغسطس 2026',
      author: 'مهدي العزاوي',
      image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800',
      readTime: '4 دقائق قراءة'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4" dir={direction}>
      <div className="container mx-auto max-w-6xl space-y-12">
        
        {/* WordPress-style Header Banner */}
        <div className="bg-gradient-to-r from-[#0B0F19] to-slate-900 text-white rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute left-0 bottom-0 w-96 h-96 bg-[#2563EB]/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="bg-[#2563EB] text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest inline-block">
              مدونة ALTUSplace الرسمية
            </span>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight">
              أحدث المقالات، الدلائل السياحية، وأخبار العقارات
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              مرجعك الأول لكل ما تحتاجه حول كراء السيارات والاستثمار العقاري في المغرب، مقالات مكتوبة بخبرة واحترافية تضاهي أقوى مدونات WordPress.
            </p>
          </div>
        </div>

        {/* Search & Widget Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 w-full md:w-96 relative">
            <Search className="absolute right-3.5 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="ابحث في المقالات والأخبار..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-10 pl-4 text-xs focus:outline-none focus:border-[#0B0F19]"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
            <Button variant="outline" className="text-xs font-bold rounded-xl border-[#0B0F19] text-[#0B0F19]">الكل</Button>
            <Button variant="ghost" className="text-xs font-bold rounded-xl text-slate-600">دليل السفر</Button>
            <Button variant="ghost" className="text-xs font-bold rounded-xl text-slate-600">استثمار عقاري</Button>
            <Button variant="ghost" className="text-xs font-bold rounded-xl text-slate-600">نصائح قيادة</Button>
          </div>
        </div>

        {/* Articles Grid (WordPress Blog Loop Style) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {articles.map((article) => (
            <div key={article.id} className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 flex flex-col group">
              <div className="relative h-52 overflow-hidden">
                <img 
                  src={article.image} 
                  alt={article.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <span className="absolute top-4 right-4 bg-[#2563EB] text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                  {article.category}
                </span>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {article.date}</span>
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {article.author}</span>
                  </div>
                  <h3 className="text-lg font-black text-[#0B0F19] leading-snug group-hover:text-[#2563EB] transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-slate-600 text-xs leading-relaxed line-clamp-3">
                    {article.excerpt}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">{article.readTime}</span>
                  <Button variant="link" className="text-[#0B0F19] font-bold p-0 h-auto flex items-center gap-1 text-xs hover:text-[#2563EB]">
                    <span>قراءة المقال</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
