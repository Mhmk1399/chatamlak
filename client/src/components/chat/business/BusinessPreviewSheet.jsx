import { useRef, useState } from "react";
import { I18nProvider } from "react-aria-components";
import { Building2, CalendarDays, Close, Phone, ScrollText, Search, Users } from "../../../icons/lucide.js";
import { t, useLocale } from "../../../i18n/locale.js";
import ToolDialog from "../tools/ToolDialog.jsx";
import "./business-preview-sheet.css";

// Presentation-only examples. Web owns real listings and work-report data.
const SAMPLE_LISTINGS = [
  { id: "sample-1", type: "sale", title: "Bright apartment in Saadat Abad", area: 115, bedrooms: 2, price: "12.8 billion toman" },
  { id: "sample-2", type: "rent", title: "Family apartment in Punak", area: 90, bedrooms: 2, price: "800 million deposit · 24 million monthly rent" },
  { id: "sample-3", type: "sale", title: "Renovated apartment in Shahran", area: 78, bedrooms: 1, price: "7.4 billion toman" },
];
const filters = [["all", "All listings"], ["sale", "For sale"], ["rent", "For rent"]];
const normalize = (value) => value.toLocaleLowerCase().replaceAll("ي", "ی").replaceAll("ك", "ک").trim();
const reportDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric",
});

function SampleNotice() {
  return <div className="ouj-business-notice">
    <span className="ouj-business-demo-label">{t("Demo preview")}</span>
    <p>{t("These examples show the layout, not information from your account.")}</p>
  </div>;
}

function ListingsPreview() {
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = SAMPLE_LISTINGS.filter((listing) => (filter === "all" || listing.type === filter)
    && normalize(t(listing.title)).includes(normalize(query)));

  return <>
    <div className="ouj-business-search">
      <Search size={19} aria-hidden="true" />
      <input ref={searchRef} type="search" className="text-base" aria-label={t("Search listings")} placeholder={t("Search listings")}
        value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} />
      {query && <button type="button" onClick={() => {
        setQuery(""); searchRef.current?.focus();
      }} aria-label={t("Clear search")}><Close size={17} /></button>}
    </div>
    <div className="ouj-business-filters" role="group" aria-label={t("Listing type")}>
      {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value}
        onClick={() => setFilter(value)}>{t(label)}</button>)}
    </div>
    <p className="ouj-business-count" role="status">{t("{count} sample listings", { count: rows.length })}</p>
    {rows.length ? <div className="ouj-business-listings">
      {rows.map((listing) => <article key={listing.id} className="ouj-business-listing" aria-label={t(listing.title)}>
        <div className={`ouj-business-property-icon ${listing.type === "rent" ? "ouj-business-property-rent" : ""}`} aria-hidden="true"><Building2 size={30} strokeWidth={1.4} /></div>
        <div className="min-w-0 flex-1">
          <span className="ouj-business-property-type">{t(listing.type === "sale" ? "For sale" : "For rent")}</span>
          <h3>{t(listing.title)}</h3>
          <p className="ouj-business-property-meta">{t("{area} m² · {rooms} bedrooms", { area: listing.area, rooms: listing.bedrooms })}</p>
          <p className="ouj-business-property-price">{t(listing.price)}</p>
        </div>
      </article>)}
    </div> : <div className="ouj-business-empty">
      <Search size={27} aria-hidden="true" />
      <p>{t("No sample listings match your search.")}</p>
      <button type="button" onClick={() => { setQuery(""); setFilter("all"); searchRef.current?.focus(); }}>{t("Clear filters")}</button>
    </div>}
  </>;
}

function ReportPreview() {
  const metrics = [
    { label: "Follow-up calls", count: 12, Icon: Phone },
    { label: "Property visits", count: 2, Icon: Building2 },
    { label: "Client follow-ups", count: 5, Icon: Users },
  ];
  return <>
    <div className="ouj-business-report-date"><CalendarDays size={19} aria-hidden="true" /><span>{t("Today")}</span><time dateTime={new Date().toISOString()} lang="fa" dir="rtl">{reportDate.format(new Date())}</time></div>
    <div className="ouj-business-metrics">
      {metrics.map(({ label, count, Icon }) => <div key={label} className="ouj-business-metric">
        <Icon size={20} aria-hidden="true" /><strong>{t("{count}", { count })}</strong><span>{t(label)}</span>
      </div>)}
    </div>
    <section className="ouj-business-report-summary" aria-label={t("Daily activity summary")}>
      <h3><ScrollText size={19} aria-hidden="true" />{t("Daily activity summary")}</h3>
      <ul>
        <li>{t("Followed up on active property requests.")}</li>
        <li>{t("Coordinated two property visits with clients.")}</li>
        <li>{t("Prepared the next follow-ups for tomorrow.")}</li>
      </ul>
    </section>
  </>;
}

export default function BusinessPreviewSheet({ id, view, onClose }) {
  const locale = useLocale();
  return <I18nProvider locale={locale === "fa" ? "fa-IR" : "en-US"}>
    <ToolDialog id={id} variant="sheet" dragToDismiss title={view === "listings" ? "My listings" : "Daily work report"} onClose={onClose}>
      <div className="ouj-business-preview" dir={locale === "fa" ? "rtl" : "ltr"}>
        <SampleNotice />
        {view === "listings" ? <ListingsPreview /> : <ReportPreview />}
        <p className="ouj-business-preview-footnote">{t("Preview only. Nothing is sent to the conversation.")}</p>
      </div>
    </ToolDialog>
  </I18nProvider>;
}
