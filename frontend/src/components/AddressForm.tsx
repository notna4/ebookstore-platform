import { Checkbox, Select, SelectItem, TextInput } from '@carbon/react';
import type { Address } from '../types';
import type { FieldErrors } from '../lib/validation';

interface Props {
  value: Address;
  errors: FieldErrors<Address>;
  onChange: (patch: Partial<Address>) => void;
  saved: Address[];
  useSaved: boolean;
  onUseSavedChange: (checked: boolean) => void;
  selectedSavedIndex: number;
  onSelectSaved: (index: number) => void;
}

const phoneCodes = ['+40', '+373', '+36', '+359', '+49'];
const countries = ['Romania', 'Moldova', 'Hungary', 'Bulgaria', 'Germany'];

export function AddressForm({ value, errors, onChange, saved, useSaved, onUseSavedChange, selectedSavedIndex, onSelectSaved }: Props) {
  const text = (key: keyof Address, label: string, extra: { type?: string; autoComplete?: string; inputMode?: 'numeric' | 'tel'; maxLength?: number } = {}) => (
    <TextInput
      id={`addr-${key}`}
      labelText={label}
      value={value[key]}
      onChange={(e) => onChange({ [key]: e.target.value })}
      invalid={!!errors[key]}
      invalidText={errors[key]}
      readOnly={useSaved}
      {...extra}
    />
  );

  return (
    <section className="checkout__address" aria-labelledby="address-heading">
      <h2 id="address-heading">Address</h2>
      {saved.length > 0 && (
        <div className="stack">
          <Checkbox id="use-saved" labelText="Use Saved Address" checked={useSaved} onChange={(_, { checked }) => onUseSavedChange(checked)} />
          {useSaved && (
            <Select id="saved-address" labelText="Saved addresses" value={String(selectedSavedIndex)} onChange={(e) => onSelectSaved(Number(e.target.value))}>
              {saved.map((a, i) => (
                <SelectItem key={i} value={String(i)} text={`${a.firstName} ${a.lastName}, ${a.address}, ${a.city} ${a.postalCode}`} />
              ))}
            </Select>
          )}
        </div>
      )}
      <div className="form-grid">
        {text('firstName', 'First Name', { autoComplete: 'given-name' })}
        {text('lastName', 'Last Name', { autoComplete: 'family-name' })}
        <div className="form-grid__full">{text('address', 'Address', { autoComplete: 'street-address' })}</div>
        {text('email', 'e-mail', { type: 'email', autoComplete: 'email' })}
        {text('city', 'City', { autoComplete: 'address-level2' })}
        {text('postalCode', 'Postal code', { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' })}
        <div className="form-grid__phone">
          <Select id="addr-phoneCode" labelText="Code" value={value.phoneCode} disabled={useSaved} onChange={(e) => onChange({ phoneCode: e.target.value })}>
            {phoneCodes.map((c) => <SelectItem key={c} value={c} text={c} />)}
          </Select>
          {text('phone', 'Phone Number', { inputMode: 'tel', maxLength: 9, autoComplete: 'tel-national' })}
        </div>
        {text('county', 'County', { autoComplete: 'address-level1' })}
        <Select id="addr-country" labelText="Country" value={value.country} disabled={useSaved} onChange={(e) => onChange({ country: e.target.value })}>
          {countries.map((c) => <SelectItem key={c} value={c} text={c} />)}
        </Select>
      </div>
    </section>
  );
}
