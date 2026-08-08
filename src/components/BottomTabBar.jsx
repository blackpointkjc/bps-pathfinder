import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Calendar, FileText, MessageCircle, User } from "lucide-react";

const tabs = [
  { label: "Home", icon: LayoutDashboard, url: createPageUrl("Dashboard") },
  { label: "Schedule", icon: Calendar, url: createPageUrl("Schedule") },
  { label: "Reports", icon: FileText, url: createPageUrl("ShiftReports") },
  { label: "Chat", icon: MessageCircle, url: createPageUrl("TeamChat") },
  { label: "Profile", icon: User, url: createPageUrl("OfficerProfile") },
];

export default function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleTabClick = (e, tab) => {
    const isActive = location.pathname === tab.url;
    if (isActive) {
      // Already on this tab — reset to root path (scroll to top effect)
      e.preventDefault();
      navigate(tab.url, { replace: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.url;
        return (
          <Link
            key={tab.label}
            to={tab.url}
            onClick={(e) => handleTabClick(e, tab)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors select-none ${
              isActive
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600"
            }`}
          >
            <tab.icon className={`w-6 h-6 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
            <span className={`text-[10px] font-medium ${isActive ? "font-semibold" : ""}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}