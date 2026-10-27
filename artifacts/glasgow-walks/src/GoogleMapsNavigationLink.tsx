import { Navigation } from 'lucide-react';

type Props = {
  href: string;
  testId: string;
};

export default function GoogleMapsNavigationLink({ href, testId }: Props) {
  const content = (
    <>
      <Navigation size={15} aria-hidden="true" />
      Open in Google Maps
    </>
  );

  if (!href) {
    return (
      <button
        type="button"
        className="button-secondary navigation-button"
        disabled
        data-testid={testId}
        aria-label="Open walk in Google Maps"
      >
        {content}
      </button>
    );
  }

  return (
    <a
      className="button-secondary navigation-button"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      aria-label="Open walk in Google Maps"
    >
      {content}
    </a>
  );
}
