import { storage } from "./storage";
import type { CalendarEvent, TimelineContext, InsertCalendarEvent } from "@shared/schema";
import { SEASONS } from "@shared/schema";

// ===== HOLIDAY SEED DATA =====
// Comprehensive multi-year, multi-region holiday database

export const SEED_EVENTS: InsertCalendarEvent[] = [
  // ==================== US FEDERAL HOLIDAYS 2025 ====================
  { name: "New Year's Day", date: "2025-01-01", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "First day of the year", tags: JSON.stringify(["new year", "celebration", "fresh start"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Martin Luther King Jr. Day", date: "2025-01-20", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "Honors civil rights leader MLK Jr.", tags: JSON.stringify(["civil rights", "equality", "justice"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Presidents' Day", date: "2025-02-17", region: "US", category: "holiday", subcategory: "federal", importance: 2, description: "Honors US presidents", tags: JSON.stringify(["presidents", "patriotic"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Memorial Day", date: "2025-05-26", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "Honors fallen military service members", tags: JSON.stringify(["military", "remembrance", "summer start"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Juneteenth", date: "2025-06-19", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "Emancipation of enslaved people", tags: JSON.stringify(["freedom", "civil rights", "history"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Independence Day", date: "2025-07-04", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "US Independence Day", tags: JSON.stringify(["patriotic", "fireworks", "summer", "celebration"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Labor Day", date: "2025-09-01", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "Honors workers and labor movement", tags: JSON.stringify(["workers", "end of summer", "back to school"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Columbus Day / Indigenous Peoples' Day", date: "2025-10-13", region: "US", category: "holiday", subcategory: "federal", importance: 2, tags: JSON.stringify(["heritage", "discovery"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Veterans Day", date: "2025-11-11", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "Honors military veterans", tags: JSON.stringify(["military", "veterans", "service"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Thanksgiving", date: "2025-11-27", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "Day of giving thanks", tags: JSON.stringify(["family", "food", "gratitude", "shopping"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Christmas Day", date: "2025-12-25", region: "US", category: "holiday", subcategory: "federal", importance: 1, description: "Christian holiday celebrating birth of Jesus", tags: JSON.stringify(["christmas", "gifts", "family", "winter"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },

  // ==================== US FEDERAL HOLIDAYS 2026 ====================
  { name: "New Year's Day", date: "2026-01-01", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["new year"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Martin Luther King Jr. Day", date: "2026-01-19", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["civil rights"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Presidents' Day", date: "2026-02-16", region: "US", category: "holiday", subcategory: "federal", importance: 2, tags: JSON.stringify(["presidents"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Memorial Day", date: "2026-05-25", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["military", "summer start"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Juneteenth", date: "2026-06-19", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["freedom"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Independence Day", date: "2026-07-04", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["patriotic", "fireworks"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Labor Day", date: "2026-09-07", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["workers"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Columbus Day", date: "2026-10-12", region: "US", category: "holiday", subcategory: "federal", importance: 2, tags: JSON.stringify(["heritage"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Veterans Day", date: "2026-11-11", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["military"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Thanksgiving", date: "2026-11-26", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["family", "food"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Christmas Day", date: "2026-12-25", region: "US", category: "holiday", subcategory: "federal", importance: 1, tags: JSON.stringify(["christmas", "gifts"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },

  // ==================== JEWISH HOLIDAYS 2025-2026 (5786) ====================
  { name: "Purim", date: "2025-03-14", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Festival of Lots, celebrating deliverance from Haman", tags: JSON.stringify(["joy", "costumes", "charity", "celebration"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Passover (Pesach)", date: "2025-04-13", endDate: "2025-04-20", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Celebrates Exodus from Egypt. Seder nights, no chametz.", tags: JSON.stringify(["freedom", "seder", "family", "spring"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom HaShoah", date: "2025-04-24", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Holocaust Remembrance Day", tags: JSON.stringify(["remembrance", "history", "memorial"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom HaZikaron", date: "2025-05-01", region: "IL", category: "holiday", subcategory: "israeli", importance: 1, description: "Israel Memorial Day for fallen soldiers", tags: JSON.stringify(["memorial", "soldiers", "israel"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom HaAtzmaut", date: "2025-05-02", region: "IL", category: "holiday", subcategory: "israeli", importance: 1, description: "Israel Independence Day", tags: JSON.stringify(["independence", "celebration", "israel", "patriotic"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Lag BaOmer", date: "2025-05-16", region: "IL", category: "religious", subcategory: "jewish", importance: 2, description: "33rd day of Omer counting, bonfires", tags: JSON.stringify(["bonfires", "celebration"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Shavuot", date: "2025-06-02", endDate: "2025-06-03", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Festival of Weeks, receiving of Torah, dairy foods", tags: JSON.stringify(["torah", "dairy", "harvest", "learning"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Tisha B'Av", date: "2025-08-03", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Day of mourning for destruction of Temples", tags: JSON.stringify(["mourning", "fasting", "history"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Rosh Hashana", date: "2025-09-23", endDate: "2025-09-24", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Jewish New Year 5786. Apples and honey, shofar.", tags: JSON.stringify(["new year", "reflection", "family", "prayer"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom Kippur", date: "2025-10-02", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Day of Atonement. 25-hour fast, holiest day.", tags: JSON.stringify(["fasting", "atonement", "prayer", "reflection"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Sukkot", date: "2025-10-07", endDate: "2025-10-13", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Feast of Tabernacles. Building sukkahs.", tags: JSON.stringify(["sukkah", "harvest", "joy", "nature"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Simchat Torah", date: "2025-10-15", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Rejoicing with the Torah", tags: JSON.stringify(["torah", "dancing", "celebration"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Hanukkah", date: "2025-12-15", endDate: "2025-12-22", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Festival of Lights. Menorah lighting, sufganiyot, dreidel.", tags: JSON.stringify(["lights", "miracles", "family", "gifts", "winter"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },

  // ==================== JEWISH HOLIDAYS 2026-2027 (5787) ====================
  { name: "Tu BiShvat", date: "2026-02-01", region: "IL", category: "religious", subcategory: "jewish", importance: 2, description: "New Year for Trees", tags: JSON.stringify(["nature", "trees", "environment"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Purim", date: "2026-03-03", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Festival of Lots", tags: JSON.stringify(["joy", "costumes", "charity"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Passover (Pesach)", date: "2026-04-02", endDate: "2026-04-09", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Celebrates Exodus from Egypt", tags: JSON.stringify(["freedom", "seder", "family", "spring"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom HaShoah", date: "2026-04-14", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Holocaust Remembrance Day", tags: JSON.stringify(["remembrance"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom HaZikaron", date: "2026-04-21", region: "IL", category: "holiday", subcategory: "israeli", importance: 1, description: "Israel Memorial Day", tags: JSON.stringify(["memorial"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom HaAtzmaut", date: "2026-04-22", region: "IL", category: "holiday", subcategory: "israeli", importance: 1, description: "Israel Independence Day", tags: JSON.stringify(["independence", "celebration"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Lag BaOmer", date: "2026-05-05", region: "IL", category: "religious", subcategory: "jewish", importance: 2, tags: JSON.stringify(["bonfires"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Shavuot", date: "2026-05-22", endDate: "2026-05-23", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Festival of Weeks", tags: JSON.stringify(["torah", "dairy"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Tisha B'Av", date: "2026-07-23", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["mourning", "fasting"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Rosh Hashana", date: "2026-09-12", endDate: "2026-09-13", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Jewish New Year 5787", tags: JSON.stringify(["new year", "reflection"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom Kippur", date: "2026-09-21", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Day of Atonement", tags: JSON.stringify(["fasting", "atonement"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Sukkot", date: "2026-09-26", endDate: "2026-10-02", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["sukkah", "harvest"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Simchat Torah", date: "2026-10-04", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["torah", "dancing"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Hanukkah", date: "2026-12-05", endDate: "2026-12-12", region: "IL", category: "religious", subcategory: "jewish", importance: 1, description: "Festival of Lights", tags: JSON.stringify(["lights", "miracles", "family"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },

  // ==================== JEWISH HOLIDAYS 2027 (5788) ====================
  { name: "Tu BiShvat", date: "2027-01-22", region: "IL", category: "religious", subcategory: "jewish", importance: 2, tags: JSON.stringify(["nature", "trees"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Purim", date: "2027-03-23", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["joy", "costumes"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Passover (Pesach)", date: "2027-04-22", endDate: "2027-04-29", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["freedom", "seder"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Shavuot", date: "2027-06-11", endDate: "2027-06-12", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["torah"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Rosh Hashana", date: "2027-10-02", endDate: "2027-10-03", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["new year"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Yom Kippur", date: "2027-10-11", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["fasting"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },
  { name: "Hanukkah", date: "2027-12-25", endDate: "2028-01-01", region: "IL", category: "religious", subcategory: "jewish", importance: 1, tags: JSON.stringify(["lights"]), isRecurring: true, recurringRule: "jewish-calendar", isActive: true },

  // ==================== GLOBAL / MARKETING DATES ====================
  { name: "Valentine's Day", date: "2026-02-14", region: "global", category: "cultural", subcategory: "marketing", importance: 1, description: "Day of love and romance", tags: JSON.stringify(["love", "romance", "gifts", "marketing"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "International Women's Day", date: "2026-03-08", region: "global", category: "cultural", subcategory: "awareness", importance: 1, tags: JSON.stringify(["women", "equality", "empowerment"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "St. Patrick's Day", date: "2026-03-17", region: "global", category: "cultural", importance: 2, tags: JSON.stringify(["irish", "celebration", "green"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Earth Day", date: "2026-04-22", region: "global", category: "cultural", subcategory: "awareness", importance: 1, description: "Environmental awareness day", tags: JSON.stringify(["environment", "sustainability", "nature"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Mother's Day (US)", date: "2026-05-10", region: "US", category: "cultural", subcategory: "marketing", importance: 1, description: "Celebrating mothers", tags: JSON.stringify(["mothers", "family", "gifts"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Father's Day (US)", date: "2026-06-21", region: "US", category: "cultural", subcategory: "marketing", importance: 1, description: "Celebrating fathers", tags: JSON.stringify(["fathers", "family", "gifts"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "World Mental Health Day", date: "2026-10-10", region: "global", category: "cultural", subcategory: "awareness", importance: 2, tags: JSON.stringify(["mental health", "awareness", "wellness"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Halloween", date: "2026-10-31", region: "US", category: "cultural", subcategory: "marketing", importance: 1, description: "Costumes, trick-or-treating", tags: JSON.stringify(["costumes", "candy", "spooky", "fall"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },

  // ==================== BUSINESS / SHOPPING EVENTS ====================
  { name: "Super Bowl", date: "2026-02-08", region: "US", category: "business", subcategory: "marketing", importance: 1, description: "NFL championship, major advertising event", tags: JSON.stringify(["sports", "advertising", "marketing", "food"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Tax Day (US)", date: "2026-04-15", region: "US", category: "business", subcategory: "financial", importance: 1, description: "Federal tax filing deadline", tags: JSON.stringify(["taxes", "financial", "deadline"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Amazon Prime Day", date: "2026-07-14", endDate: "2026-07-15", region: "global", category: "business", subcategory: "shopping", importance: 1, description: "Major online shopping event", tags: JSON.stringify(["shopping", "deals", "ecommerce"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Back to School Season", date: "2026-08-01", endDate: "2026-09-07", region: "US", category: "business", subcategory: "marketing", importance: 1, description: "Back-to-school shopping and preparation season", tags: JSON.stringify(["school", "shopping", "education", "kids"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Black Friday", date: "2026-11-27", region: "US", category: "business", subcategory: "shopping", importance: 1, description: "Biggest shopping day of the year", tags: JSON.stringify(["shopping", "deals", "retail", "holiday season"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Cyber Monday", date: "2026-11-30", region: "US", category: "business", subcategory: "shopping", importance: 1, description: "Biggest online shopping day", tags: JSON.stringify(["shopping", "ecommerce", "deals"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Small Business Saturday", date: "2026-11-28", region: "US", category: "business", subcategory: "shopping", importance: 2, description: "Support local small businesses", tags: JSON.stringify(["small business", "local", "shopping"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Giving Tuesday", date: "2026-12-01", region: "global", category: "business", subcategory: "charity", importance: 2, description: "Global day of giving", tags: JSON.stringify(["charity", "giving", "nonprofit"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },

  // ==================== AWARENESS MONTHS ====================
  { name: "Black History Month", date: "2026-02-01", endDate: "2026-02-28", region: "US", category: "cultural", subcategory: "awareness", importance: 1, tags: JSON.stringify(["history", "diversity", "culture"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Women's History Month", date: "2026-03-01", endDate: "2026-03-31", region: "US", category: "cultural", subcategory: "awareness", importance: 1, tags: JSON.stringify(["women", "history", "empowerment"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Pride Month", date: "2026-06-01", endDate: "2026-06-30", region: "global", category: "cultural", subcategory: "awareness", importance: 1, description: "LGBTQ+ Pride", tags: JSON.stringify(["pride", "lgbtq", "inclusion", "diversity"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Hispanic Heritage Month", date: "2026-09-15", endDate: "2026-10-15", region: "US", category: "cultural", subcategory: "awareness", importance: 1, tags: JSON.stringify(["hispanic", "heritage", "culture"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "Breast Cancer Awareness Month", date: "2026-10-01", endDate: "2026-10-31", region: "global", category: "cultural", subcategory: "awareness", importance: 1, tags: JSON.stringify(["health", "cancer", "awareness", "pink"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },

  // ==================== EASTER / CHRISTIAN 2025-2027 ====================
  { name: "Easter", date: "2025-04-20", region: "global", category: "religious", subcategory: "christian", importance: 1, description: "Resurrection of Jesus Christ", tags: JSON.stringify(["easter", "spring", "family", "religious"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Easter", date: "2026-04-05", region: "global", category: "religious", subcategory: "christian", importance: 1, tags: JSON.stringify(["easter", "spring"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },
  { name: "Easter", date: "2027-03-28", region: "global", category: "religious", subcategory: "christian", importance: 1, tags: JSON.stringify(["easter", "spring"]), isRecurring: true, recurringRule: "yearly-floating", isActive: true },

  // ==================== ISLAMIC HOLIDAYS 2026 (approximate) ====================
  { name: "Ramadan Begins", date: "2026-02-18", region: "global", category: "religious", subcategory: "islamic", importance: 1, description: "Holy month of fasting", tags: JSON.stringify(["fasting", "prayer", "community"]), isRecurring: true, recurringRule: "islamic-calendar", isActive: true },
  { name: "Eid al-Fitr", date: "2026-03-20", region: "global", category: "religious", subcategory: "islamic", importance: 1, description: "End of Ramadan celebration", tags: JSON.stringify(["celebration", "family", "food", "gifts"]), isRecurring: true, recurringRule: "islamic-calendar", isActive: true },
  { name: "Eid al-Adha", date: "2026-05-27", region: "global", category: "religious", subcategory: "islamic", importance: 1, description: "Festival of Sacrifice", tags: JSON.stringify(["sacrifice", "family", "charity"]), isRecurring: true, recurringRule: "islamic-calendar", isActive: true },

  // ==================== OTHER GLOBAL ====================
  { name: "Chinese New Year", date: "2026-02-17", region: "global", category: "cultural", subcategory: "chinese", importance: 1, description: "Year of the Horse", tags: JSON.stringify(["lunar new year", "chinese", "celebration", "family"]), isRecurring: true, recurringRule: "lunar-calendar", isActive: true },
  { name: "Diwali", date: "2026-10-20", region: "global", category: "religious", subcategory: "hindu", importance: 1, description: "Festival of Lights (Hindu)", tags: JSON.stringify(["lights", "celebration", "hindu", "family"]), isRecurring: true, recurringRule: "hindu-calendar", isActive: true },
  { name: "World Book Day", date: "2026-04-23", region: "global", category: "cultural", subcategory: "awareness", importance: 2, description: "UNESCO World Book and Copyright Day", tags: JSON.stringify(["books", "reading", "publishing"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "International Day of Peace", date: "2026-09-21", region: "global", category: "cultural", subcategory: "awareness", importance: 2, tags: JSON.stringify(["peace", "unity"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
  { name: "New Year's Eve", date: "2026-12-31", region: "global", category: "holiday", subcategory: "cultural", importance: 1, tags: JSON.stringify(["celebration", "party", "countdown"]), isRecurring: true, recurringRule: "yearly-fixed", isActive: true },
];

// ===== TIMELINE ENGINE =====

function getSeason(date: Date): string {
  const month = date.getMonth() + 1;
  for (const [key, season] of Object.entries(SEASONS)) {
    if (season.months.includes(month)) return season.name;
  }
  return "Unknown";
}

function getQuarter(date: Date): string {
  const month = date.getMonth() + 1;
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

function getMonthContext(date: Date): string {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  const dayOfMonth = date.getDate();
  const part = dayOfMonth <= 10 ? "early" : dayOfMonth <= 20 ? "mid" : "late";
  return `${part} ${month} ${year}`;
}

function daysBetween(d1: string, d2: string): number {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

export async function buildTimelineContext(
  referenceDate?: string,
  dateRange?: { start: string; end: string },
  regions?: string[],
  categories?: string[],
): Promise<TimelineContext> {
  const now = referenceDate || new Date().toISOString().split("T")[0];
  const nowDate = new Date(now);
  const targetRegions = regions || ["global", "US", "IL"];
  const targetCategories = categories || ["holiday", "religious", "cultural", "business"];

  // Get events for a wide window (90 days back, 180 days forward)
  const windowStart = new Date(nowDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const windowEnd = new Date(nowDate.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const allEvents = await storage.getCalendarEventsInRange(windowStart, windowEnd, targetRegions);

  // Filter by categories if specified
  const filtered = targetCategories.length > 0
    ? allEvents.filter((e) => targetCategories.includes(e.category))
    : allEvents;

  // Separate upcoming and recent
  const upcoming = filtered
    .filter((e) => e.date >= now)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 15)
    .map((e) => ({ name: e.name, date: e.date, daysAway: daysBetween(now, e.date), category: e.category }));

  const recent = filtered
    .filter((e) => e.date < now)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((e) => ({ name: e.name, date: e.date, daysAgo: daysBetween(e.date, now), category: e.category }));

  // Get events within date range if specified
  let relevantEvents: CalendarEvent[] = [];
  if (dateRange) {
    relevantEvents = await storage.getCalendarEventsInRange(dateRange.start, dateRange.end, targetRegions);
  }

  return {
    currentDate: now,
    dateRange,
    season: getSeason(nowDate),
    upcomingHolidays: upcoming,
    recentHolidays: recent,
    monthContext: getMonthContext(nowDate),
    quarterContext: `${getQuarter(nowDate)} ${nowDate.getFullYear()}`,
    relevantEvents,
  };
}

// Build the system prompt injection for timeline-aware AI
export function buildTimelinePrompt(ctx: TimelineContext, useCase: "book" | "marketing" | "personal" | "general"): string {
  const lines: string[] = [];

  lines.push(`=== TIMELINE & CALENDAR CONTEXT ===`);
  lines.push(`Current date: ${ctx.currentDate}`);
  lines.push(`Season: ${ctx.season}`);
  lines.push(`Period: ${ctx.monthContext} (${ctx.quarterContext})`);

  if (ctx.dateRange) {
    lines.push(`\nPlanning range: ${ctx.dateRange.start} to ${ctx.dateRange.end}`);
  }

  if (ctx.upcomingHolidays.length > 0) {
    lines.push(`\nUPCOMING HOLIDAYS & EVENTS (next 6 months):`);
    for (const h of ctx.upcomingHolidays) {
      lines.push(`  - ${h.date}: ${h.name} (${h.category}, in ${h.daysAway} days)`);
    }
  }

  if (ctx.recentHolidays.length > 0) {
    lines.push(`\nRECENT HOLIDAYS & EVENTS (past 3 months):`);
    for (const h of ctx.recentHolidays.slice(0, 5)) {
      lines.push(`  - ${h.date}: ${h.name} (${h.daysAgo} days ago)`);
    }
  }

  if (ctx.relevantEvents.length > 0) {
    lines.push(`\nEVENTS WITHIN PLANNING RANGE:`);
    for (const e of ctx.relevantEvents) {
      lines.push(`  - ${e.date}${e.endDate ? ' to ' + e.endDate : ''}: ${e.name} [${e.region}/${e.category}]${e.description ? ' - ' + e.description : ''}`);
    }
  }

  // Use-case-specific instructions
  lines.push(`\n=== TIMELINE RULES ===`);

  if (useCase === "book") {
    lines.push(`BOOK / STORY TIMELINE RULES:
- Ground the narrative in realistic time progression — days, weeks, and seasons should advance naturally
- Reference real holidays and seasonal changes as anchors for character development
- If a character is Jewish/Israeli, weave in Jewish holidays naturally (Shabbat rhythm, holiday preparations)
- Seasonal mood: Spring = renewal/hope, Summer = energy/adventure, Fall = reflection/change, Winter = introspection/challenge
- Track character aging and growth relative to the timeline
- Chapter/section transitions should indicate time passage clearly
- Weather, daylight hours, and cultural events should match the dates
- If the story spans multiple months, key holidays in that period MUST appear or be acknowledged
- Use holidays as emotional milestones (e.g., first Passover alone, Christmas reunion)`);
  } else if (useCase === "marketing") {
    lines.push(`MARKETING PLAN TIMELINE RULES:
- Align campaigns with upcoming holidays and shopping events
- Plan content calendars around awareness months and cultural moments
- Build lead-time into campaigns: major holidays need 4-8 weeks of prep
- Black Friday/Cyber Monday campaigns should start planning by September
- Use seasonal themes (spring cleaning, summer fun, back-to-school, holiday gifting)
- Account for regional differences (US vs Israel vs global audiences)
- Religious holidays = sensitivity required, but gift-giving ones = marketing opportunities
- Q4 is peak retail season: Thanksgiving → Black Friday → Cyber Monday → Hanukkah/Christmas → NYE
- Avoid scheduling major launches on somber days (Yom Kippur, Tisha B'Av, Memorial Days)
- Awareness months are great for brand-building campaigns aligned with values`);
  } else if (useCase === "personal") {
    lines.push(`PERSONAL DEVELOPMENT TIMELINE RULES:
- Set goals aligned with natural time cycles (New Year, Rosh Hashana, quarterly reviews)
- Use holidays as reflection checkpoints and milestone markers
- 90-day sprints align well with quarterly boundaries
- Account for holiday breaks and lower productivity periods
- Jewish calendar: Elul (month before Rosh Hashana) is traditionally a time of reflection and self-improvement
- January/New Year and September/Fall are natural "fresh start" periods
- Summer may have lower focus due to vacations — plan accordingly
- Build habit streaks around holiday breaks (maintain through disruptions)
- Use seasonal energy: Spring for new initiatives, Fall for deepening commitments`);
  } else {
    lines.push(`GENERAL TIMELINE AWARENESS:
- Reference dates and holidays accurately
- Be aware of current season and cultural context
- Respect religious and cultural observances
- Use the calendar to ground responses in reality`);
  }

  return lines.join("\n");
}

// Seed the database with initial holiday data
export async function seedCalendarEvents(): Promise<number> {
  const existing = await storage.getCalendarEventCount();
  if (existing > 0) return existing;

  let count = 0;
  for (const event of SEED_EVENTS) {
    await storage.createCalendarEvent(event);
    count++;
  }
  console.log(`Seeded ${count} calendar events`);
  return count;
}
