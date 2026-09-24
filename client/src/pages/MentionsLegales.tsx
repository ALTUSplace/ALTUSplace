import LegalDocPage from "./LegalDocPage";
import source from "../../../legal/mentions-legales.md?raw";

export default function MentionsLegales() {
  return (
    <LegalDocPage
      source={source}
      title="الإعلان القانوني | ALTUSplace"
      description="المعلومات القانونية لمنصة ALTUSplace: الناشر، النشاط، الاستضافة، الملكية الفكرية والقانون المغربي المطبق."
      path="/mentions-legales"
    />
  );
}