import * as LucideIcons from 'lucide-react';
import { HelpCircle } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface Props extends Omit<LucideProps, 'ref' | 'name'> {
  name?: string | null;
}

export default function LucideIcon({ name, ...rest }: Props) {
  if (!name) return <HelpCircle {...rest} />;
  const Cmp = (LucideIcons as unknown as Record<string, React.ComponentType<LucideProps>>)[name];
  if (!Cmp) return <HelpCircle {...rest} />;
  return <Cmp {...rest} />;
}
