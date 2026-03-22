import { useState } from "react";
import { resolveAvatarUrl } from "../lib/avatarUrl";

const sizes = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-base"
};

function DirectorAvatarInner({ director, size = "md", className = "", title }) {
  const [broken, setBroken] = useState(false);
  const initials = director?.initials || (director?.name ? String(director.name).slice(0, 2).toUpperCase() : "—");
  const url = broken ? null : resolveAvatarUrl(director?.avatarUrl);

  return (
    <div
      className={[
        "relative shrink-0 overflow-hidden rounded-full bg-brand-50 font-bold text-brand-700",
        sizes[size] || sizes.md,
        className
      ].join(" ")}
      title={title ?? director?.name}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">{initials}</span>
      )}
    </div>
  );
}

export default function DirectorAvatar(props) {
  const k = `${props.director?.id ?? ""}-${props.director?.avatarUrl ?? ""}`;
  return <DirectorAvatarInner key={k} {...props} />;
}
