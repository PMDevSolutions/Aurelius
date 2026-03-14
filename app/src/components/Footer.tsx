import { BookOpen, Lightbulb, Bug, Mail } from "lucide-react";

const links = [
  { label: "Documentation", icon: BookOpen, href: "#" },
  { label: "Feature requests", icon: Lightbulb, href: "#" },
  { label: "Report a bug", icon: Bug, href: "#" },
  { label: "Contact us", icon: Mail, href: "#" },
];

export function Footer() {
  return (
    <footer className="border-2 border-[#5b5959] rounded-[14px] bg-bg-700 shadow-[0px_4px_10px_0px_rgba(0,0,0,0.25)] px-6 py-3">
      <div className="flex items-center justify-between">
        {links.map(({ label, icon: Icon, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-body-12 text-text-secondary hover:text-white transition-colors"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        ))}
      </div>
    </footer>
  );
}
