import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { DragController } from '../game/drag-controller';
import type { BoardPosition } from '../game/merge/merge-types';
import { MergeService } from '../services/merge-service';
import { RecruitmentService, type RecruitmentResult } from '../services/recruitment-service';
import { GameContext } from '../core/game-context';
import { MergeBoardView } from './merge-board-view';
import { WorkerView } from './worker-view';
import { ToastView } from './toast-view';
import { FeedbackView } from './feedback-view';
import type { MergeCompletedEvent, SalaryChangedEvent } from '../core/game-events';

const { ccclass } = _decorator;
const property = (value: unknown): any => { const decorator = _decorator as unknown as { property?: (type: unknown) => any }; return decorator.property ? decorator.property(value) : () => {}; };
const resolveCocosType = (name: string): unknown => (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; }
interface ButtonLike { on?: (event: string, callback: () => void, target?: unknown) => void; off?: (event: string, callback: () => void, target?: unknown) => void; }
interface SceneNodeLike { name?: string; children?: readonly SceneNodeLike[]; active?: boolean; getChildByName?: (name: string) => SceneNodeLike | null; getComponent?: (type: string) => unknown; }
export interface WorkerCardState { readonly id: string; readonly level: number; readonly displayText: string; readonly position: BoardPosition; }

@ccclass('MainView')
export class MainView extends Component {
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public rankLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public salaryLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public hintLabel?: TextLike;
  @property(resolveCocosType('Button'))
  public recruitButton?: ButtonLike;
  @property(MergeBoardView)
  public boardView?: MergeBoardView;
  @property([WorkerView])
  public workerViews: WorkerView[] = [];
  @property(ToastView)
  public toastView?: ToastView;
  @property(FeedbackView)
  public feedbackView?: FeedbackView;
  public boardSnapshot: Array<WorkerCardState | undefined> = [];
  public context?: GameContext;

  private recruitment?: RecruitmentService;
  private merge?: MergeService;
  private drag?: DragController;
  private lastDisplayedMaxWorkerLevel = 0;
  private readonly onRecruitPressed = (): void => { this.recruit(); };

  protected onLoad(): void {
    this.resolveSceneReferences();
    if (!this.context) this.attachContext(new GameContext());
    else this.bindWorkerViews(this.workerViews);
  }

  public attachContext(context: GameContext): void {
    this.detachContext();
    this.context = context;
    this.recruitment = new RecruitmentService(context);
    this.merge = new MergeService(context);
    this.drag = new DragController({
      getWorker: (position) => context.board.getWorker(position),
      maxWorkerLevel: context.board.maxWorkerLevel,
      onMove: (from, to) => { context.board.move(from, to); context.syncPlayerWorkers(); context.saveService.save(context.player); this.refresh(); },
      onMerge: (from, to) => { this.merge?.merge(from, to); this.drag?.completeMerge(); this.refresh(); },
    });
    context.events.on('workerRecruited', this.refreshFromEvent);
    context.events.on('mergeCompleted', this.onMergeCompleted);
    context.events.on('salaryChanged', this.onSalaryChanged);
    this.recruitButton?.on?.('click', this.onRecruitPressed, this);
    this.bindWorkerViews(this.workerViews);
    this.refresh();
  }

  public detachContext(): void {
    if (this.context) {
      this.context.events.off('workerRecruited', this.refreshFromEvent);
      this.context.events.off('mergeCompleted', this.onMergeCompleted);
      this.context.events.off('salaryChanged', this.onSalaryChanged);
    }
    this.recruitButton?.off?.('click', this.onRecruitPressed, this);
    this.workerViews.forEach((view) => view.unbind());
    this.workerViews.forEach((view) => view.clear());
    this.feedbackView?.stopTweens(); this.toastView?.stop();
    this.context = undefined; this.recruitment = undefined; this.merge = undefined; this.drag = undefined;
    this.boardSnapshot = [];
  }

  public recruit(): RecruitmentResult | undefined {
    const result = this.recruitment?.recruit();
    if (result && !result.success) { this.setText(this.hintLabel, result.message); this.toastView?.show(result.message); }
    return result;
  }

  public bindWorkerViews(views: readonly WorkerView[]): void {
    this.workerViews.forEach((view) => view.unbind());
    this.workerViews = [...views];
    if (this.boardView && this.drag) this.workerViews.forEach((view) => view.bind(this.boardView!, this.drag!));
    this.refresh();
  }
  public getDragController(): DragController | undefined { return this.drag; }
  public onDestroy(): void { this.detachContext(); }

  public refresh(updateLevelBaseline = true): void {
    const context = this.context;
    if (!context) return;
    const rank = context.configService.worker.levels.find((level) => level.level === context.player.maxWorkerLevel) ?? context.configService.worker.levels[0];
    this.setText(this.rankLabel, `当前职级：${rank.name}`);
    this.setText(this.salaryLabel, `工资：${context.player.salary}`);
    this.setText(this.titleLabel, '牛马修仙传');
    this.boardSnapshot = context.board.cells.map((cell) => {
      const worker = cell.occupant;
      return worker ? { id: worker.id, level: worker.level, displayText: WorkerView.format(worker), position: { row: cell.row, column: cell.column } } : undefined;
    });
    this.workerViews.forEach((view, index) => {
      const card = this.boardSnapshot[index];
      if (this.boardView) view.setBoardPosition(card?.position ?? { row: Math.floor(index / this.boardView.rows), column: index % this.boardView.columns });
      if (card) view.refresh(card);
      else view.clear();
    });
    if (updateLevelBaseline) this.lastDisplayedMaxWorkerLevel = context.player.maxWorkerLevel;
  }

  private resolveSceneReferences(): void {
    const node = (this as unknown as { node?: SceneNodeLike }).node;
    const child = (name: string): SceneNodeLike | undefined => node?.getChildByName?.(name) ?? node?.children?.find((candidate) => candidate.name === name);
    const component = (name: string, type: string): unknown => child(name)?.getComponent?.(type);
    this.titleLabel ??= component('Title', 'Label') as TextLike | undefined;
    this.rankLabel ??= component('RankLabel', 'Label') as TextLike | undefined;
    this.salaryLabel ??= component('SalaryLabel', 'Label') as TextLike | undefined;
    this.hintLabel ??= component('HintLabel', 'Label') as TextLike | undefined;
    this.recruitButton ??= component('RecruitButton', 'Button') as ButtonLike | undefined;
    this.toastView ??= component('Toast', 'ToastView') as ToastView | undefined;
    this.feedbackView ??= component('Feedback', 'FeedbackView') as FeedbackView | undefined;
    const boardNode = child('MergeBoard');
    this.boardView ??= boardNode?.getComponent?.('MergeBoardView') as MergeBoardView | undefined;
    if (this.boardView && !this.workerViews.length) {
      this.workerViews = (boardNode?.children ?? []).map((cell) => cell.getComponent?.('WorkerView')).filter((view): view is WorkerView => view instanceof WorkerView);
    }
  }

  private readonly refreshFromEvent = (): void => { this.refresh(); };
  private readonly onSalaryChanged = (event: SalaryChangedEvent): void => { this.refresh(false); this.feedbackView?.showSalary(event.amount); };
  private readonly onMergeCompleted = (event: MergeCompletedEvent): void => {
    const previousLevel = this.lastDisplayedMaxWorkerLevel;
    this.refresh();
    if (event.worker.level > previousLevel) {
      const rank = this.context?.configService.worker.levels.find((level) => level.level === event.worker.level);
      if (rank) this.feedbackView?.showBreakthrough(rank.name, rank.level);
    }
    const position = event.second.row * (this.boardView?.columns ?? 4) + event.second.column;
    const target = this.workerViews[position] as unknown as { node?: unknown } | undefined;
    this.feedbackView?.playMerge(target?.node as any);
  };
  private setText(target: TextLike | undefined, value: string): void { if (target) target.string = value; }
}
