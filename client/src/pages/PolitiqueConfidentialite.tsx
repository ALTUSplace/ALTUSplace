import LegalDocPage from "./LegalDocPage";
import source from "../../../legal/politique-confidentialite.md?raw";

export default function PolitiqueConfidentialite() {
  return (
    <LegalDocPage
      source={source}
      title="سياسة الخصوصية | ALTUSplace"
      description="كيفية جمع ومعالجة بياناتك الشخصية في ALTUSplace وحماية معلوماتك عند كراء السيارات والعقارات بالمغرب، وفق القانون رقم 09-08."
      path="/politique-confidentialite"
    />
  );
}