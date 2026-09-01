import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { renderWithProviders } from '@/test/utils';
import { PlacePickerField } from './components/PlacePickerField';

/**
 * Savannakhet has a district and no villages under it, which is the shape of the
 * real tree outside the capital and the whole reason this picker exists.
 */
const tree = [
  {
    id: 'p1',
    nameLo: 'ນະຄອນຫຼວງວຽງຈັນ',
    nameEn: 'Vientiane Capital',
    type: 'province',
    children: [
      {
        id: 'd1',
        nameLo: 'ຈັນທະບູລີ',
        nameEn: 'Chanthabuly',
        type: 'district',
        children: [
          { id: 'v1', nameLo: 'ດົງປ່າແຫລບ', nameEn: 'Dongpalep', type: 'village', children: [] },
          { id: 'v2', nameLo: 'ຫາຍໂສກ', nameEn: 'Haysok', type: 'village', children: [] },
        ],
      },
    ],
  },
  {
    id: 'p2',
    nameLo: 'ສະຫວັນນະເຂດ',
    nameEn: 'Savannakhet',
    type: 'province',
    children: [
      { id: 'd2', nameLo: 'ໄກສອນພົມວິຫານ', nameEn: 'Kaysone', type: 'district', children: [] },
    ],
  },
];

vi.mock('./api', () => ({
  useLocationTree: () => ({ data: tree, isLoading: false }),
}));

function Harness({ initial }: { initial: string }) {
  const form = useForm({ defaultValues: { birthLocationId: initial } });
  const value = form.watch('birthLocationId');
  return (
    <Form {...form}>
      <div data-testid="value">{value || 'EMPTY'}</div>
      <PlacePickerField control={form.control} name="birthLocationId" label="Province" />
    </Form>
  );
}

const combo = (n: number) => screen.getAllByRole('combobox')[n]!;

describe('PlacePickerField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the level of the stored node off its ancestry', async () => {
    renderWithProviders(<Harness initial="v1" />);
    expect(combo(0)).toHaveTextContent('Vientiane Capital');
    expect(combo(1)).toHaveTextContent('Chanthabuly');
    expect(combo(2)).toHaveTextContent('Dongpalep');
  });

  it('shows a stored district without pretending a village was chosen', async () => {
    renderWithProviders(<Harness initial="d1" />);
    expect(combo(0)).toHaveTextContent('Vientiane Capital');
    expect(combo(1)).toHaveTextContent('Chanthabuly');
    expect(screen.getByTestId('value')).toHaveTextContent('d1');
  });

  it('stores the province as soon as one is picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="" />);

    await user.click(combo(0));
    await user.click(await screen.findByRole('button', { name: /Savannakhet/ }));

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('p2'));
  });

  it('stops at the district where the tree has no villages', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="p2" />);

    await user.click(combo(1));
    await user.click(await screen.findByRole('button', { name: /Kaysone/ }));

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('d2'));
    expect(combo(2)).toBeDisabled();
  });

  it('falls back to the district when the village is cleared', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="v1" />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[2]!);

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('d1'));
    expect(combo(1)).toHaveTextContent('Chanthabuly');

    // …and to the province when the district goes too.
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]!);
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('p1'));
  });

  it('empties the field when the province is cleared', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="v1" />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('EMPTY'));
  });
});
