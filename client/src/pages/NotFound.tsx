import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0B0F15] text-[#E2E8F0] px-4">
      <Card className="w-full max-w-lg mx-4 shadow-2xl border border-border bg-[#131922]/90 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <img
              src="/images/logo.png"
              alt="ALTUSplace — B2-Rent"
              loading="lazy"
              className="brand-logo h-16 w-auto object-contain"
            />
          </div>

          <h1 className="text-5xl font-black text-[#D98236] mb-2">404</h1>

          <h2 className="text-xl font-semibold text-[#E2E8F0] mb-4">
            الصفحة غير موجودة · Page introuvable
          </h2>

          <p className="text-[#A7B2C1] mb-8 leading-relaxed">
            عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
            <br />
            Désolé, la page que vous recherchez n'existe pas ou a été déplacée.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="bg-[#D98236] hover:bg-[#B96A28] text-white px-6 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-[#D98236]/25 cursor-pointer"
            >
              <Home className="w-4 h-4 mr-2" />
              العودة إلى الرئيسية · Accueil
            </Button>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-[#6B7686]">
            <AlertCircle className="h-3.5 w-3.5" />
            Error 404 — ALTUSplace · B2-Rent
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

