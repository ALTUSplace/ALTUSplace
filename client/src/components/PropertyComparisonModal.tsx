import React from 'react';
import { X, Check, Building2, MapPin, DollarSign, Layers, Bed, Sparkles, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export interface PropertyItem {
  id: string | number;
  title: string;
  city: string;
  price: number;
  rooms: number;
  bathrooms?: number;
  area: string;
  type: string;
  image: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  comparedProperties: PropertyItem[];
  onRemove: (id: string | number) => void;
}

export default function PropertyComparisonModal({ isOpen, onClose, comparedProperties, onRemove }: Props) {
  if (comparedProperties.length === 0) return null;

  // Find min price to highlight best deal
  const prices = comparedProperties.map(p => p.price);
  const minPrice = Math.min(...prices);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            جدول مقارنة العقارات الذكي ({comparedProperties.length}/3)
          </DialogTitle>
          <p className="text-xs text-slate-500">تم تمييز الأسعار التنافسية والاختلافات الرئيسية بلون مميز لتسهيل الاختيار.</p>
        </DialogHeader>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-3 px-4 text-right text-xs font-semibold text-slate-500 w-1/4">المواصفات الرئيسية</th>
                {comparedProperties.map((prop) => (
                  <th key={prop.id} className="py-3 px-4 text-right w-1/4 min-w-[200px]">
                    <div className="relative group bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <button
                        onClick={() => onRemove(prop.id)}
                        className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors z-10"
                        title="إزالة من المقارنة"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <img 
                        src={prop.image || "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600"} 
                        alt={prop.title}
                        loading="lazy"
                        className="w-full h-24 object-cover rounded-lg mb-2 border"
                      />
                      <h4 className="font-bold text-slate-900 text-xs truncate">{prop.title}</h4>
                      {prop.price === minPrice && (
                        <Badge className="mt-1 bg-emerald-600 text-white text-[10px] py-0.5 px-2 gap-1 flex items-center w-fit">
                          <Award className="w-3 h-3" /> السعر الأفضل
                        </Badge>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-600 bg-slate-50 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" /> المدينة / الموقع
                </td>
                {comparedProperties.map((prop) => (
                  <td key={prop.id} className="py-3 px-4 font-medium text-slate-900 bg-blue-50/40">{prop.city}</td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-600 bg-slate-50 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-slate-400" /> السعر اليومي
                </td>
                {comparedProperties.map((prop) => (
                  <td key={prop.id} className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-lg font-bold text-sm ${prop.price === minPrice ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-50 text-amber-800'}`}>
                      {prop.price} درهم
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-600 bg-slate-50 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-slate-400" /> المساحة التقريبية
                </td>
                {comparedProperties.map((prop) => (
                  <td key={prop.id} className="py-3 px-4 font-semibold text-purple-700 bg-purple-50/40">{prop.area || '140 متر²'}</td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-600 bg-slate-50 flex items-center gap-1.5">
                  <Bed className="w-4 h-4 text-slate-400" /> عدد الغرف
                </td>
                {comparedProperties.map((prop) => (
                  <td key={prop.id} className="py-3 px-4 font-medium text-slate-800">{prop.rooms} غرف نوم</td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-600 bg-slate-50 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-slate-400" /> نوع العقار
                </td>
                {comparedProperties.map((prop) => (
                  <td key={prop.id} className="py-3 px-4 capitalize font-medium text-slate-800 bg-slate-50/50">{prop.type}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            إغلاق المقارنة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
