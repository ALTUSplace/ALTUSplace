import { Car, ShieldCheck, Award, Users } from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-16">
      <div className="container mx-auto px-4 max-w-4xl space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">منصة B2-Rent الرائدة</span>
          <h1 className="text-4xl font-extrabold text-white">نعيد تعريف تجربة تأجير السيارات في المغرب</h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-base">
            تأسست B2-Rent لتكون الجسر الموثوق بين أفضل وكالات تأجير السيارات والعملاء الباحثين عن الفخامة، الأمان، والشفافية التامة في أغادير، مراكش، الدار البيضاء، وطنجة.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl space-y-3 shadow-xl">
            <ShieldCheck className="w-10 h-10 text-amber-400 mb-2" />
            <h3 className="text-xl font-bold text-white">موثوقية تامة</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              جميع الوكالات مسجلة قانونياً وتخضع لمعايير جودة صارمة لضمان راحة البال التامة.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl space-y-3 shadow-xl">
            <Award className="w-10 h-10 text-amber-400 mb-2" />
            <h3 className="text-xl font-bold text-white">أسطول متنوع</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              من سيارات الدفع الرباعي الفاخرة لرحلات الصحراء إلى السيارات الاقتصادية للتنقل الحضري.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl space-y-3 shadow-xl">
            <Users className="w-10 h-10 text-amber-400 mb-2" />
            <h3 className="text-xl font-bold text-white">دعم مستمر</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              فريق خدمة عملاء ودعم فوري عبر واتساب متواجد طوال أيام الأسبوع لمساعدتك في أي وقت.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
