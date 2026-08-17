import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { IndexedDbPngStyleRepository } from '../../domain/imageGeneration/pngStyle';
import { PngStyleLibraryPanel } from './PngStyleLibraryPanel';

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  return concat(uint32(data.length), strToU8(type), data, new Uint8Array(4));
}

function a1111Png(): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = concat(uint32(2), uint32(2), new Uint8Array([8, 6, 0, 0, 0]));
  const parameters = [
    '1girl, by wlop, cinematic lighting, masterpiece, <lora:test:0.7>',
    'Negative prompt: lowres, bad hands',
    'Steps: 28, Sampler: Euler, CFG scale: 6, Seed: 99, Model: private.ckpt'
  ].join('\n');
  return concat(
    signature,
    chunk('IHDR', ihdr),
    chunk('tEXt', concat(strToU8('parameters'), new Uint8Array([0]), strToU8(parameters))),
    chunk('IDAT', new Uint8Array([0])),
    chunk('IEND', new Uint8Array())
  );
}

describe('PngStyleLibraryPanel', () => {
  it('imports a PNG into a review draft and saves only the confirmed style asset', async () => {
    const repository = new IndexedDbPngStyleRepository(`png-style-ui-${crypto.randomUUID()}`);
    render(
      <PngStyleLibraryPanel
        repository={repository}
        canApplyParameterDraft={false}
      />
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('PNG 画风库为空'));

    const bytes = a1111Png();
    const file = new File([asArrayBuffer(bytes)], 'sample.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    });
    fireEvent.change(screen.getByLabelText('导入 PNG 画风文件'), {
      target: { files: [file] }
    });

    expect(await screen.findByRole('region', { name: 'PNG 画风草稿' })).toBeInTheDocument();
    expect(screen.getByLabelText('画师标签（逗号分隔，原文保存）')).toHaveValue('by wlop');
    expect(screen.getByLabelText('Tag 模型正向画风')).toHaveValue('cinematic lighting, masterpiece');
    expect(screen.getByRole('checkbox', { name: /<lora:test:0.7>/ })).not.toBeChecked();
    expect(screen.getByText(/1girl/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '保存为 PNG 画风' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已保存'));
    const saved = await repository.load();
    expect(saved.presets).toHaveLength(1);
    expect(saved.presets[0]?.artistTokens).toEqual(['by wlop']);
    expect(JSON.stringify(saved)).not.toContain('private.ckpt');
    expect(JSON.stringify(saved)).not.toContain('Seed');
  });

  it('keeps an existing library intact when a damaged PNG is selected', async () => {
    const repository = new IndexedDbPngStyleRepository(`png-style-ui-broken-${crypto.randomUUID()}`);
    render(
      <PngStyleLibraryPanel
        repository={repository}
        canApplyParameterDraft={false}
      />
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('PNG 画风库为空'));
    const brokenBytes = new Uint8Array([1, 2, 3]);
    const broken = new File([asArrayBuffer(brokenBytes)], 'broken.png', { type: 'image/png' });
    Object.defineProperty(broken, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3]).buffer });
    fireEvent.change(screen.getByLabelText('导入 PNG 画风文件'), {
      target: { files: [broken] }
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('不是有效 PNG'));
    await expect(repository.load()).resolves.toMatchObject({ presets: [] });
  });
});
