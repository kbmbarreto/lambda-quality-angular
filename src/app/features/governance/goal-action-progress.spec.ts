import { TestBed } from '@angular/core/testing';
import { GoalActionCompletion } from './goal-action-progress';
import { GoalActionProgress } from './governance.models';

function view(progress: GoalActionProgress | null, overviewPercent?: number | null) {
  const f = TestBed.createComponent(GoalActionCompletion);
  f.componentRef.setInput('data', progress);
  if (overviewPercent !== undefined) f.componentRef.setInput('overviewPercent', overviewPercent);
  f.detectChanges();
  return f;
}
const empty: GoalActionProgress = {
  basis: 'ACTIONS',
  totalActions: 0,
  completedActions: 0,
  cancelledActions: 0,
  percent: null,
};

describe('Action completion indicators', () => {
  it('distinguishes no valid actions from zero percent and shows excluded cancellations', () => {
    const f = view({ ...empty, cancelledActions: 3 });
    expect(f.nativeElement.textContent).toContain('Sem ações válidas');
    expect(f.nativeElement.textContent).toContain('3 canceladas');
    expect(f.nativeElement.querySelector('.goal-action-ring').textContent.trim()).toBe('—');
    f.componentRef.setInput('data', { ...empty, totalActions: 3, percent: 0 });
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Sem ações válidas');
    expect(f.nativeElement.querySelector('.goal-action-ring').textContent.trim()).toBe('0%');
    expect(f.nativeElement.textContent).toContain('0 de 3 ações válidas concluídas');
  });
  it('preserves fractional completion and does not display 100 while pending', () => {
    for (const [completedActions, totalActions, percent, label] of [
      [1, 3, 33.33, '33,33%'],
      [99999, 100000, 99.99, '99,99%'],
      [3, 3, 100, '100%'],
    ] as const) {
      const f = view({ ...empty, completedActions, totalActions, percent });
      expect(f.nativeElement.querySelector('.goal-action-ring').textContent.trim()).toBe(label);
      expect(f.nativeElement.querySelector('[role=img]').getAttribute('aria-label')).toContain(
        label,
      );
      expect(f.componentInstance.percent()).toBe(percent);
      f.destroy();
    }
  });
  it('uses the overview progress field without deriving a target ratio', () => {
    const f = view({ ...empty, totalActions: 3, completedActions: 1, percent: 33.33 }, 33.33);
    expect(f.componentInstance.label()).toBe('33,33%');
    f.componentRef.setInput('overviewPercent', null);
    f.detectChanges();
    expect(f.componentInstance.percent()).toBeNull();
  });
  it('does not reinterpret a legacy metric percentage as action completion', () => {
    const f = view(null, 85);
    expect(f.nativeElement.textContent).toContain('Progresso das ações indisponível');
    expect(f.nativeElement.textContent).not.toContain('85%');
  });
});
