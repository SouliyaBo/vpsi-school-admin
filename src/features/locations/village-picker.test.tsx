import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { renderWithProviders } from '@/test/utils';
import { VillagePickerField } from './components/VillagePickerField';

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
    nameLo: 'ຫຼວງພະບາງ',
    nameEn: 'Luang Prabang',
    type: 'province',
    children: [
      {
        id: 'd2',
        nameLo: 'ຫຼວງພະບາງເມືອງ',
        nameEn: 'LPB City',
        type: 'district',
        children: [{ id: 'v3', nameLo: 'ບ້ານຊຽງທອງ', nameEn: 'Xiengthong', type: 'village', children: [] }],
      },
    ],
  },
];

vi.mock('./api', () => ({
  useLocationTree: () => ({ data: tree, isLoading: false }),
}));

function Harness({ initial }: { initial: string }) {
  const form = useForm({ defaultValues: { villageId: initial } });
  const value = form.watch('villageId');
  return (
    <Form {...form}>
      <div data-testid="value">{value || 'EMPTY'}</div>
      <VillagePickerField control={form.control} name="villageId" label="Village" />
    </Form>
  );
}

const combo = (n: number) => screen.getAllByRole('combobox')[n]!;

describe('VillagePickerField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preselects the province/district of an existing village', async () => {
    renderWithProviders(<Harness initial="v1" />);
    expect(combo(0)).toHaveTextContent('Vientiane Capital');
    expect(combo(1)).toHaveTextContent('Chanthabuly');
    expect(combo(2)).toHaveTextContent('Dongpalep');
  });

  it('lets an existing address be changed to another province', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="v1" />);

    await user.click(combo(0));
    await user.click(await screen.findByRole('button', { name: /Luang Prabang/ }));

    await waitFor(() => expect(combo(0)).toHaveTextContent('Luang Prabang'));
    expect(screen.getByTestId('value').textContent).not.toBe('v1');

    await user.click(combo(1));
    await user.click(await screen.findByRole('button', { name: /LPB City/ }));
    await waitFor(() => expect(combo(1)).toHaveTextContent('LPB City'));

    await user.click(combo(2));
    await user.click(await screen.findByRole('button', { name: /Xiengthong/ }));
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('v3'));
  });

  it('clears the village on its own without losing the province and district', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="v1" />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[2]!);

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('EMPTY'));
    expect(combo(0)).toHaveTextContent('Vientiane Capital');
    expect(combo(1)).toHaveTextContent('Chanthabuly');

    await user.click(combo(2));
    await user.click(await screen.findByRole('button', { name: /Haysok/ }));
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('v2'));
  });

  it('changes the district within the same province', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="v1" />);

    await user.click(combo(1));
    await user.click(await screen.findByRole('button', { name: /Chanthabuly/ }));

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('EMPTY'));
    expect(combo(0)).toHaveTextContent('Vientiane Capital');
  });
});
