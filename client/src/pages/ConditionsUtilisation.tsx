import LegalDocPage from "./LegalDocPage";
import source from "../../../legal/conditions-utilisation.md?raw";

export default function ConditionsUtilisation() {
  return (
    <LegalDocPage
      source={source}
      title="شروط الاستخدام | ALTUSplace"
      description="شروط وقواعد استخدام منصة ALTUSplace لكراء السيارات والعقارات في المغرب: الحجز، الدفع، الإلغاء، الضمان المالي والتعويضات."
      path="/conditions-utilisation"
    />
  );
}