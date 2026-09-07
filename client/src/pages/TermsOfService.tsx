import React, { useState } from 'react';
import { ShieldCheck, FileText, Lock, Scale, CheckCircle2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function TermsOfService() {
  const [lang, setLang] = useState<'ar' | 'fr'>('ar');

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header & Lang Toggle */}
        <div className="bg-card p-6 sm:p-8 rounded-2xl shadow-sm border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-600 font-semibold mb-1">
              <Scale className="w-5 h-5" />
              <span>{lang === 'ar' ? 'النظام القانوني وحقوق الوساطة' : 'Cadre Juridique et Médiation'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {lang === 'ar' ? 'شروط الاستخدام وسياسة الضمان (Escrow)' : "Conditions d'Utilisation & Politique d'Escrow"}
            </h1>
          </div>

          <div className="flex items-center gap-2 bg-muted p-1.5 rounded-xl self-start">
            <Button 
              size="sm" 
              variant={lang === 'ar' ? 'default' : 'ghost'} 
              className={lang === 'ar' ? 'bg-[#0B0F15] text-white' : 'text-muted-foreground'}
              onClick={() => setLang('ar')}
            >
              العربية
            </Button>
            <Button 
              size="sm" 
              variant={lang === 'fr' ? 'default' : 'ghost'} 
              className={lang === 'fr' ? 'bg-[#0B0F15] text-white' : 'text-muted-foreground'}
              onClick={() => setLang('fr')}
            >
              Français
            </Button>
          </div>
        </div>

        {/* Content Section */}
        {lang === 'ar' ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-6 text-foreground leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                1. مقدمة ونطاق الوساطة (Scope of Brokerage)
              </h2>
              <p>
                منصة <strong>B2-Rent</strong> هي منصة إعلانية ووسيط تقني فقط، تربط بين مزودي الخدمات المعتمدين (شركات كراء السيارات وأصحاب العقارات والمنعشين العقاريين) وبين الزبائن والباحثين عن الإيجار في المملكة المغربية. لا تمتلك المنصة السيارة أو العقار ولا تديرهما، ولا تحل محل الشريك في معاينة الأصل أو تسليمه.
              </p>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950">
                <strong>إخلاء المسؤولية:</strong> يقر الزبون والشريك بأن الشريك يتحمل مسؤولية الحالة الميكانيكية والسلامة والنظافة والوصف الصحيح للسيارة أو العقار، وأن على الزبون معاينة الأصل وإبلاغ الشريك بأي تحفظ عند التسليم. لا تتحمل B2-Rent المسؤولية عن العيوب أو الحالة الميكانيكية للسيارة أو نظافة العقار أو حالته، وذلك في حدود ما يسمح به القانون المغربي ودون المساس بالحقوق القانونية الآمرة.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <FileText className="w-5 h-5 text-blue-600" />
                2. عمولة المنصة ورسوم الوساطة (Platform Commission)
              </h2>
              <p>
                تتقاضى منصة B2-Rent عمولة ثابتة قدرها <strong>10%</strong> من إجمالي قيمة مبلغ الحجز المؤكد مقابل خدمات الوساطة التقنية وتوفير العقود الرقمية ونظام الضمان. يتم اقتطاع هذه العمولة تلقائياً عند إتمام الدفع، وتظهر بوضوح في الفاتورة الرسمية الصادرة عبر النظام بصيغة PDF.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <Lock className="w-5 h-5 text-amber-600" />
                3. نظام الضمان المالي والحجز (Escrow & Payment Security)
              </h2>
              <p>
                تُحفظ أموال الحجوزات في حساب الضمان الآمن للمنصة ولا يتم تحويلها إلى حساب الشريك (الوكالة أو صاحب العقار) إلا بعد مرور 24 ساعة على بدء فترة الإيجار بنجاح ودون تسجيل أي نزاع رسمي عبر مركز حل النزاعات.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <Scale className="w-5 h-5 text-red-600" />
                4. مسؤولية الأطراف ومحاربة الاحتيال (Anti-Fraud Policy)
              </h2>
              <p>
                يلتزم الشركاء بتقديم بيانات صحيحة ووثائق قانونية موثقة (السجل التجاري، البطاقة الوطنية). تتحمل الوكالة أو صاحب العقار المسؤولية القانونية الكاملة عن مطابقة الأصول المعروضة للواقع. تحظر المنصة تماماً أي تعاملات مالية خارج النظام وتعرض المخالفين للحظر الفوري والمساءلة القانونية.
              </p>
            </section>
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-6 text-foreground leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                1. Introduction et Portée de la Médiation
              </h2>
              <p>
                La plateforme <strong>B2-Rent</strong> est uniquement une plateforme publicitaire et un intermédiaire technologique reliant les prestataires agréés (agences de location de voitures et propriétaires immobiliers) et les clients au Maroc. B2-Rent ne possède ni n'exploite le véhicule ou le bien et ne remplace pas le Partenaire lors de l'inspection ou de la remise.
              </p>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950">
                <strong>Clause de non-responsabilité :</strong> Le Client et le Partenaire reconnaissent que le Partenaire reste responsable de l'état mécanique, de la sécurité, de la propreté et de la conformité de l'annonce du véhicule ou du bien. Le Client doit examiner le bien et signaler toute réserve au Partenaire lors de la remise. B2-Rent n'est pas responsable des défauts, de l'état mécanique du véhicule ou de la propreté et de l'état du bien, dans les limites permises par le droit marocain et sans préjudice des droits impératifs.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <FileText className="w-5 h-5 text-blue-600" />
                2. Commission de la Plateforme
              </h2>
              <p>
                ALTUSplace perçoit une commission fixe de <strong>10%</strong> sur le montant total de chaque réservation confirmée pour couvrir les services technologiques, contrats numériques et la garantie sécurisée.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <Lock className="w-5 h-5 text-amber-600" />
                3. Système de Séquestre (Escrow)
              </h2>
              <p>
                Les fonds des réservations sont conservés dans le compte séquestre sécurisé de la plateforme et ne sont versés au partenaire qu'après 24 heures du début effectif de la location sans réclamation ni litige.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <Scale className="w-5 h-5 text-red-600" />
                4. Responsabilité et Lutte Anti-Fraude
              </h2>
              <p>
                Les partenaires s'engagent à fournir des informations et documents légaux valides (Registre de Commerce, CIN). Toute transaction effectuée en dehors de la plateforme est strictement interdite et entraîne la suspension immédiate du compte.
              </p>
            </section>
          </div>
        )}

      </div>
    </div>
  );
}
