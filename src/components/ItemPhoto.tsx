import { useI18n } from '../i18n';
import { displayName } from '../model/items';
import type { Item } from '../model/types';
import { usePhotoUrl } from '../store/photos';

/**
 * The florist's own photo of the item, else the built-in picture, else a colored tile with
 * the item's first letter.
 */
export function ItemPhoto({ item, size }: { item: Item; size: 'small' | 'medium' | 'large' }) {
  const { locale } = useI18n();
  const ownUrl = usePhotoUrl(item.photoId);
  const url = ownUrl ?? (item.photo ? `${import.meta.env.BASE_URL}${item.photo}` : undefined);
  if (url) {
    return <img className={`item-photo item-photo-${size}`} src={url} alt="" loading="lazy" decoding="async" />;
  }
  const letter = [...displayName(item, locale).replace(/[^\p{Letter}]/gu, '')][0] ?? '·';
  return (
    <div className={`item-photo item-photo-${size} item-photo-empty is-${item.category}`} aria-hidden="true">
      {letter}
    </div>
  );
}
