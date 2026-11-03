import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Link as RouterLink } from "react-router-dom";

type NextLinkProps = ComponentPropsWithoutRef<"a"> & {
  href?: string;
};

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, ...props },
  ref,
) {
  if (href && href.startsWith("/")) {
    return <RouterLink ref={ref} to={href} {...props} />;
  }
  return <a ref={ref} href={href} {...props} />;
});

export default Link;
