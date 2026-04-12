import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LocaleToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === "en" ? "he" : "en")}
      className="h-8 gap-1.5 px-2 text-xs font-medium"
      data-testid="button-locale-toggle"
    >
      <Languages className="w-4 h-4" />
      {locale === "en" ? "עב" : "EN"}
    </Button>
  );
}
