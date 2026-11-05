export interface ProjectSection {
  title: string;
  root: string;
  selector: string;
  detail: string;
  heading: string;
  action: string;
  permission: string;
  module: boolean;
}
const projects: ProjectSection = {
  title: 'Projetos',
  root: '/projetos',
  selector: 'projects',
  detail: '',
  heading: 'Projetos do Workspace',
  action: 'Abrir projeto',
  permission: 'project.read',
  module: false,
};
const sections: Record<string, ProjectSection> = {
  environments: {
    title: 'Ambientes',
    root: '/ambientes',
    selector: 'environments',
    detail: 'environments',
    heading: 'Selecione um projeto para administrar seus ambientes',
    action: 'Abrir ambientes',
    permission: 'project.read',
    module: true,
  },
  testCases: {
    title: 'Casos de teste',
    root: '/casos-de-teste',
    selector: 'test-cases',
    detail: 'test-cases',
    heading: 'Selecione um projeto para acessar seus casos de teste',
    action: 'Abrir casos de teste',
    permission: 'testcase.read',
    module: true,
  },
  execution: {
    title: 'Planos e execuções',
    root: '/planos-e-execucoes',
    selector: 'execution',
    detail: 'execution',
    heading: 'Selecione um projeto para acessar planos e execuções',
    action: 'Abrir planos e execuções',
    permission: 'testrun.read',
    module: true,
  },
  defects: {
    title: 'Defeitos',
    root: '/defeitos',
    selector: 'defects',
    detail: 'defects',
    heading: 'Selecione um projeto para acessar seus defeitos',
    action: 'Abrir defeitos',
    permission: 'defect.read',
    module: true,
  },
};
export function projectSection(data: Record<string, unknown>): ProjectSection {
  return Object.entries(sections).find(([key]) => !!data[key])?.[1] ?? projects;
}
export function projectSectionRoot(title: string): string {
  return Object.values(sections).find((section) => section.title === title)?.root ?? projects.root;
}
