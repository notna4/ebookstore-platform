import { Dropdown } from '@carbon/react';

export interface Option<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  id: string;
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function FilterDropdown<T extends string>({ id, label, options, value, onChange }: Props<T>) {
  const selected = options.find((o) => o.id === value) ?? options[0];
  return (
    <Dropdown<Option<T>>
      id={id}
      titleText={label}
      label={label}
      size="md"
      items={options}
      itemToString={(o) => o?.label ?? ''}
      selectedItem={selected}
      onChange={({ selectedItem }) => selectedItem && onChange(selectedItem.id)}
    />
  );
}
