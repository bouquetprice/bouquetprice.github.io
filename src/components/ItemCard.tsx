// Catalog item view: a card that floats over the dimmed catalog — big picture, name, sale price.

import { useI18n } from '../i18n';
import { displayName } from '../model/items';
import { NAME_LANGUAGES, type Item } from '../model/types';
import { ItemPhoto } from './ItemPhoto';
import { CloseIcon, useOverlay } from './Sheet';

interface ItemCardProps {
  item: Item;
  /** Sale price, e.g. "7.13 ₪", and what it is for ("per stem"); null when there is no price. */
  price: { amount: string; unit: string } | null;
  onEditPrice: () => void;
  onClose: () => void;
}

export function ItemCard({ item, price, onEditPrice, onClose }: ItemCardProps) {
  const { t, locale } = useI18n();
  useOverlay(onClose);
  const name = displayName(item, locale);
  // The item's other names, so anyone in the shop recognises it.
  const otherNames = NAME_LANGUAGES.map((language) => item.names[language]).filter(
    (other): other is string => !!other && other !== name,
  );

  return (
    <div className="item-card-backdrop" onClick={onClose}>
      <div
        className="item-card"
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="item-card-photo">
          <ItemPhoto item={item} size="large" />
          <button type="button" className="item-card-close" onClick={onClose} aria-label={t.common.close}>
            <CloseIcon />
          </button>
        </div>
        <div className="item-card-body">
          <h2 className="item-card-name">{name}</h2>
          {otherNames.length > 0 && <p className="item-card-other muted">{otherNames.join(' · ')}</p>}
          {price ? (
            <p className="item-card-price">
              <span className="item-card-amount">{price.amount}</span> <span className="muted">{price.unit}</span>
            </p>
          ) : (
            <p className="item-card-price no-price">{t.common.noPrice}</p>
          )}
          <button type="button" className="primary-button" onClick={onEditPrice}>
            {t.catalog.editPrice}
          </button>
        </div>
      </div>
    </div>
  );
}
