import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageProbeBoundaryLab } from './ImageProbeBoundaryLab';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImageProbeBoundaryLab', () => {
  it('states its no-generation boundary and runs the SD WebUI metadata path', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ImageProbeBoundaryLab />);

    expect(screen.getByText(/不会生成图片、不会产生模型费用、不会保存配置或凭据/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('目标后端'), { target: { value: 'sd-webui' } });
    expect(screen.getByLabelText('Base URL')).toHaveValue('http://127.0.0.1:7860');
    fireEvent.click(screen.getByRole('button', { name: '开始元数据诊断' }));

    await waitFor(() => expect(screen.getAllByText('通过')).toHaveLength(4));
    expect(screen.getAllByText(/这只证明连接能力/)).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.queryByText('ComfyUI WebSocket')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('目标后端'), { target: { value: 'comfyui-core' } });
    expect(screen.queryByRole('heading', { name: '浏览器边界证据' })).not.toBeInTheDocument();
  });

  it('shows Basic fields without storing values outside component state', () => {
    render(<ImageProbeBoundaryLab />);
    fireEvent.change(screen.getByLabelText('鉴权方式'), { target: { value: 'basic' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'tester' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'memory-only' } });

    expect(screen.getByLabelText('用户名')).toHaveValue('tester');
    expect(screen.getByLabelText('密码')).toHaveValue('memory-only');
    expect(localStorage.length).toBe(0);
  });

  it('requires explicit fee confirmation and rehearses all generation stages without a provider call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <StrictMode>
        <ImageProbeBoundaryLab />
      </StrictMode>
    );

    expect(screen.getByRole('region', { name: '图片档案三层测试' })).toBeInTheDocument();
    const generationButton = screen.getByRole('button', { name: '预览真实生成测试' });
    expect(generationButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '执行本地校验' }));
    expect(generationButton).toBeEnabled();
    fireEvent.click(generationButton);

    const confirmation = screen.getByRole('dialog', { name: '生成测试费用确认' });
    expect(confirmation).toHaveTextContent('可能产生费用');
    expect(confirmation).toHaveTextContent('当前按钮只演练 UI');
    fireEvent.click(screen.getByRole('button', { name: '确认并演练界面（不调用供应商）' }));

    await screen.findByText(/七阶段界面演练完成/);
    expect(container.querySelectorAll('.image-probe-lab__generation-stages li[data-status="completed"]')).toHaveLength(7);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/没有写入 ImageProbeStore/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清理演练结果' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '真实生成测试阶段' })).not.toBeInTheDocument());
  });
});
