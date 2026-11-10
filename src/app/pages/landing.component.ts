import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { OrgConfigService } from '../org-config.service';
import { PermsetService } from '../permset.service';

interface GraphNodeSeed {
  id: string;
  name: string;
  country: string;
  title: string;
  flagUrl?: string;
  logo?: string;
  structural?: boolean;
  hideLabel?: boolean;
}

interface GraphNode extends GraphNodeSeed {
  event?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, AsyncPipe],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('site') site!: ElementRef<HTMLElement>;

  connectionStatus = '';

  private readonly cleanups: Array<() => void> = [];
  private motionTimer = 0;
  private sectorFrame = 0;

  constructor(
    public auth: AuthService,
    public orgConfig: OrgConfigService,
    public permsets: PermsetService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('reason')) {
        setTimeout(() => document.getElementById('admin-login')?.scrollIntoView({ behavior: 'smooth' }), 0);
      }
    });
  }

  ngAfterViewInit(): void {
    const site = this.site.nativeElement;
    this.initReveal(site);
    this.initPageMotion(site);
    this.initHeaderContrast(site);
    this.initSectorOrbit(site);
    this.initRelationshipGraph(site);
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.motionTimer);
    if (this.sectorFrame) cancelAnimationFrame(this.sectorFrame);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }

  onStartConnectionSubmit(event: Event): void {
    event.preventDefault();
    this.connectionStatus = 'Connection requests are not open on this site yet.';
  }

  login(target = '/home'): void {
    this.auth
      .loginWithRedirect({
        appState: { target },
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
      })
      .subscribe();
  }

  logout(): void {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }

  private listen(target: Window | HTMLElement, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  private initReveal(site: HTMLElement): void {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 }
    );
    site.querySelectorAll('.reveal').forEach((item) => observer.observe(item));
    this.cleanups.push(() => observer.disconnect());
  }

  private initPageMotion(site: HTMLElement): void {
    const markPageMoving = () => {
      site.classList.add('page-is-moving');
      window.clearTimeout(this.motionTimer);
      this.motionTimer = window.setTimeout(() => site.classList.remove('page-is-moving'), 240);
    };
    this.listen(window, 'scroll', markPageMoving, { passive: true });
    this.listen(window, 'wheel', markPageMoving, { passive: true });
    this.listen(window, 'touchmove', markPageMoving, { passive: true });
  }

  private initHeaderContrast(site: HTMLElement): void {
    const header = site.querySelector('.site-header') as HTMLElement | null;
    if (!header) return;
    const measureHeader = () => {
      site.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`);
    };
    measureHeader();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measureHeader);
      observer.observe(header);
      this.cleanups.push(() => observer.disconnect());
    }
    this.listen(window, 'resize', measureHeader, { passive: true });

    const update = () => {
      const x = window.innerWidth / 2;
      const y = Math.max(1, header.getBoundingClientRect().bottom + 8);
      const section = document.elementFromPoint(x, y)?.closest('section, footer, main');
      const onDark = Boolean(section?.classList.contains('section-dark') || section?.classList.contains('hero'));
      header.classList.toggle('on-dark', onDark);
    };
    update();
    this.listen(window, 'scroll', () => requestAnimationFrame(update), { passive: true });
    this.listen(window, 'resize', () => requestAnimationFrame(update), { passive: true });
  }

  private initSectorOrbit(site: HTMLElement): void {
    const orbit = site.querySelector('.sector-orbit') as HTMLElement | null;
    if (!orbit) return;
    const svg = orbit.querySelector('.sector-edges') as SVGSVGElement | null;
    const collage = orbit.querySelector('.sector-collage') as HTMLImageElement | null;
    const labels = Array.from(orbit.querySelectorAll<HTMLElement>('[data-sector-node]'));
    const namespace = 'http://www.w3.org/2000/svg';
    const descriptions: Record<string, string> = {
      'Accounting/Finance': 'Financial resource management and accountability.',
      Communications: 'Information flow, IT, translation, media, telecom, and radio.',
      'Development/Resilience': 'Infrastructure, build back better, mitigation, and community resilience.',
      Field: 'Direct on-the-ground response, field teams, assessments, and survivor support.',
      'Health/Medical/WASH': 'Medical response, sanitation, hygiene, WASH support, and personnel deployment.',
      Logistics: 'Procurement, storage, transport, warehousing, and distribution.',
      Management: 'Strategy, coordination, reporting, and operations center leadership.',
      Networking: 'Relationship building and network strengthening.',
      "Policy/Legal/Gov't": 'Governance, frameworks, legal support, and public-sector liaison.',
      'Research/Data/Reporting': 'Data synthesis, needs analysis, research, and reporting.',
      Security: 'Physical safety, data protection, cyber infrastructure, and risk awareness.',
      Training: 'Training, exercises, preparedness skills, and practical learning.',
      'Well-being/Wellness': 'Trauma care, counseling, spiritual care, and responder wellness.',
      'Unspecified/General': 'Broad or unclassified involvement, interest, or capability.',
    };
    const popup = document.createElement('aside');
    popup.className = 'sector-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-live', 'polite');
    popup.hidden = true;
    orbit.appendChild(popup);

    const hidePopup = () => {
      popup.hidden = true;
      orbit.classList.remove('popup-open');
      orbit.closest('.object-frame')?.classList.remove('popup-open');
      labels.forEach((label) => label.classList.remove('active'));
    };

    const showPopup = (label: HTMLElement) => {
      const name = (label.textContent || '').trim();
      const color = getComputedStyle(label).getPropertyValue('--sector').trim() || '#134e84';
      const orbitRect = orbit.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const left = labelRect.left - orbitRect.left + labelRect.width / 2;
      const top = labelRect.top - orbitRect.top + labelRect.height / 2;
      labels.forEach((item) => item.classList.toggle('active', item === label));
      orbit.classList.add('popup-open');
      orbit.closest('.object-frame')?.classList.add('popup-open');
      popup.innerHTML = `
        <strong class="sector-popup-title">${name}</strong>
        <p>${descriptions[name] || 'An IDRN designation area documenting skill, interest, or response capability.'}</p>
        <em>Designators document areas of skill &amp; interest for IDRN Members</em>
      `;
      popup.style.setProperty('--popup-color', color);
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.hidden = false;
    };

    labels.forEach((label) => {
      label.setAttribute('tabindex', '0');
      label.setAttribute('role', 'button');
      label.setAttribute('aria-label', `${(label.textContent || '').trim()} designation details`);
      const onClick = (event: Event) => {
        event.stopPropagation();
        if (!popup.hidden && label.classList.contains('active')) hidePopup();
        else showPopup(label);
      };
      const onKey = (event: Event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') {
          event.preventDefault();
          label.click();
        }
      };
      label.addEventListener('click', onClick);
      label.addEventListener('keydown', onKey);
      this.cleanups.push(() => {
        label.removeEventListener('click', onClick);
        label.removeEventListener('keydown', onKey);
      });
    });

    const onOrbitClick = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-sector-node], .sector-popup')) hidePopup();
    };
    orbit.addEventListener('click', onOrbitClick);
    this.cleanups.push(() => orbit.removeEventListener('click', onOrbitClick));
    this.listen(document as unknown as HTMLElement, 'keydown', ((event: Event) => {
      if ((event as KeyboardEvent).key === 'Escape') hidePopup();
    }) as EventListener);

    const draw = () => {
      if (!svg || !collage) return;
      const orbitRect = orbit.getBoundingClientRect();
      const imageRect = collage.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${orbitRect.width} ${orbitRect.height}`);
      svg.innerHTML = '';
      labels.forEach((label) => {
        const color = getComputedStyle(label).getPropertyValue('--sector').trim() || '#134e84';
        const labelRect = label.getBoundingClientRect();
        const targetX = labelRect.left - orbitRect.left + labelRect.width / 2;
        const targetY = labelRect.top - orbitRect.top + labelRect.height / 2;
        const anchors = (label.dataset['anchor'] || '')
          .split(';')
          .map((pair) => pair.split(',').map(Number))
          .filter((pair): pair is [number, number] => pair.length === 2 && pair.every(Number.isFinite));
        anchors.forEach(([x, y]) => {
          const sourceX = imageRect.left - orbitRect.left + (imageRect.width * x) / 100;
          const sourceY = imageRect.top - orbitRect.top + (imageRect.height * y) / 100;
          const line = document.createElementNS(namespace, 'line');
          line.setAttribute('x1', String(sourceX));
          line.setAttribute('y1', String(sourceY));
          line.setAttribute('x2', String(targetX));
          line.setAttribute('y2', String(targetY));
          line.style.setProperty('--edge-color', color);
          svg.appendChild(line);
          const point = document.createElementNS(namespace, 'circle');
          point.setAttribute('cx', String(sourceX));
          point.setAttribute('cy', String(sourceY));
          point.setAttribute('r', '4');
          point.style.setProperty('--edge-color', color);
          svg.appendChild(point);
        });
      });
    };

    const drawLoop = () => {
      draw();
      this.sectorFrame = requestAnimationFrame(drawLoop);
    };
    if (collage?.complete) drawLoop();
    else collage?.addEventListener('load', drawLoop, { once: true });
    this.listen(window, 'resize', draw as EventListener, { passive: true });
  }

  private initRelationshipGraph(site: HTMLElement): void {
    const svg = site.querySelector('#idrn-relationship-graph') as SVGSVGElement | null;
    const details = site.querySelector('#relationship-details') as HTMLElement | null;
    if (!svg || !details) return;

    const circleFlagBaseUrl = 'https://hatscripts.github.io/circle-flags/flags';
    const flagUrl = (code: string) => `${circleFlagBaseUrl}/${code}.svg`;
    const seeds: GraphNodeSeed[] = [
      { id: 'Pradeep', name: 'Pradeep', country: 'India', flagUrl: flagUrl('in'), title: 'Independent consultant, trainer, creator' },
      { id: 'Yolande', name: 'Yolande', country: 'South Africa', flagUrl: flagUrl('za'), title: 'Head of regional crisis response non-profit' },
      { id: 'Evert', name: 'Evert', country: 'Netherlands', flagUrl: flagUrl('nl'), title: 'Head of a global crisis response technology group' },
      { id: 'Timothy', name: 'Timothy', country: 'Korea', logo: '/assets/idrn-south-korea-node.png', title: 'Leader of IDRN South Korea' },
      { id: 'Tim', name: 'Tim', country: 'UK', flagUrl: flagUrl('gb'), title: 'Retired Major General from the British Army, CBE' },
      { id: 'Newt', name: 'Newt', country: 'Canada', flagUrl: flagUrl('ca'), title: 'Crisis response expert, consultant' },
      { id: 'Elmer', name: 'Elmer', country: 'Philippines', logo: '/assets/idrn-philippines-node.png', title: 'Leader of IDRN Philippines' },
      { id: 'Daron', name: 'Daron', country: 'Malaysia', flagUrl: flagUrl('my'), title: 'Regional leader, local pastor' },
      { id: 'Andy', name: 'Andy', country: 'Portugal', flagUrl: flagUrl('pt'), title: 'Founder of BuildSOS' },
      { id: 'Yazi', name: 'Yazi', country: 'Niger', flagUrl: flagUrl('ne'), title: 'Leader of IDRN Africa' },
      { id: 'Moses', name: 'Moses', country: 'Kenya', flagUrl: flagUrl('ke'), title: 'Young media producer, volunteer' },
      { id: 'Vivek', name: 'Vivek', country: 'USA', flagUrl: flagUrl('us'), title: 'Founder of PERCI' },
      { id: 'Adeel', name: 'Adeel', country: 'Pakistan', flagUrl: flagUrl('pk'), title: 'Regional non-profit leader' },
      { id: 'Gabriel', name: 'Gabriel', country: 'Brazil', flagUrl: flagUrl('br'), title: 'Software developer, volunteer' },
      { id: 'Matt', name: 'Matt', country: 'USA', flagUrl: flagUrl('us'), title: 'IDRN Global, network champion' },
      { id: 'IDRN Global', name: 'International Advisors', country: 'Global', title: 'Facilitating and supporting the wider network', logo: '/assets/idrn-global-mark.png', structural: true, hideLabel: true },
      { id: 'IDRN Africa', name: 'IDRN Africa', country: 'Africa', title: 'Developing IDRN presence across Africa', logo: '/assets/idrn-africa-node.png', structural: true },
      { id: 'IDRN Network', name: 'IDRN Network', country: 'Global', title: 'The wider International Disaster Response Network', logo: '/assets/idrn-disaster-network-logo-small.png', structural: true, hideLabel: true },
    ];

    const width = svg.clientWidth || 720;
    const height = svg.clientHeight || 560;
    const nodeById = new Map<string, GraphNode>(
      seeds.map((node, index) => [
        node.id,
        {
          ...node,
          x: width / 2 + Math.cos(index) * width * 0.25,
          y: height * 0.42 + Math.sin(index) * height * 0.22,
          vx: 0,
          vy: 0,
        },
      ])
    );
    let selectedId: string | null = null;

    const staticLinks = [
      ...['Gabriel', 'Tim', 'Adeel', 'Daron', 'Pradeep', 'Elmer', 'Yolande'].map((source) => ({ source, target: 'IDRN Global', type: 'static' })),
      ...['Moses', 'Yolande', 'Yazi'].map((source) => ({ source, target: 'IDRN Africa', type: 'static' })),
      ...['Evert', 'Vivek', 'Newt', 'Matt', 'Andy', 'Timothy', 'Elmer', 'Daron', 'Yazi', 'IDRN Global'].map((source) => ({ source, target: 'IDRN Network', type: 'static' })),
      { source: 'Matt', target: 'IDRN Global', type: 'static' },
    ];
    const peerLinks: Record<string, string[]> = {
      Gabriel: ['Matt', 'IDRN Network'],
      Daron: ['Matt', 'Elmer'],
      Elmer: ['Daron', 'Matt', 'Yazi'],
      Pradeep: ['Matt'],
    };
    const expoParticipants = ['Newt', 'Andy', 'Matt', 'Daron', 'Evert'];
    const istanbulParticipants = ['Yolande', 'Matt', 'Yazi', 'Elmer', 'Adeel'];
    const expoNodes = new Set(expoParticipants);
    const istanbulNodes = new Set(istanbulParticipants);

    const activeLinks = () => {
      const links = [...staticLinks];
      if (selectedId) {
        (peerLinks[selectedId] || []).forEach((target) => links.push({ source: selectedId as string, target, type: 'peer' }));
        if (expoNodes.has(selectedId)) {
          expoParticipants.forEach((source) => links.push({ source, target: 'Disaster EXPO', type: 'event' }));
        }
        if (istanbulNodes.has(selectedId)) {
          istanbulParticipants.forEach((source) => links.push({ source, target: 'Istanbul Mtg', type: 'event' }));
        }
      }
      return links;
    };

    const activeNodes = (): GraphNode[] => {
      const nodes = [...nodeById.values()];
      if (selectedId && expoNodes.has(selectedId)) {
        nodes.push({ id: 'Disaster EXPO', name: 'Disaster EXPO', country: 'Event', title: 'Shared event context', event: true, x: width * 0.72, y: height * 0.2, vx: 0, vy: 0 });
      }
      if (selectedId && istanbulNodes.has(selectedId)) {
        nodes.push({ id: 'Istanbul Mtg', name: 'Istanbul Mtg', country: 'Event', title: '2024 IDRN Gathering', event: true, x: width * 0.76, y: height * 0.78, vx: 0, vy: 0 });
      }
      return nodes;
    };

    const renderDetails = (node: GraphNode | null) => {
      if (!node) {
        details.innerHTML = '<p class="kicker">Select a node</p><h3>Relationship map</h3><p>Click a person or network node to reveal details, peer links, and shared event context.</p>';
        return;
      }
      details.innerHTML = `<p class="kicker">${node.country || 'Network'}</p><h3>${node.name}</h3><p>${node.title}</p>`;
    };

    const tick = (nodes: GraphNode[], links: Array<{ source: string; target: string; type: string }>) => {
      const lookup = new Map(nodes.map((node) => [node.id, node]));
      for (let i = 0; i < 70; i += 1) {
        for (let a = 0; a < nodes.length; a += 1) {
          for (let b = a + 1; b < nodes.length; b += 1) {
            const first = nodes[a];
            const second = nodes[b];
            const dx = second.x - first.x || 0.01;
            const dy = second.y - first.y || 0.01;
            const dist = Math.max(22, Math.hypot(dx, dy));
            const force = (first.structural || second.structural ? 1260 : 920) / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            first.vx -= fx;
            first.vy -= fy;
            second.vx += fx;
            second.vy += fy;
          }
        }
        links.forEach((link) => {
          const source = lookup.get(link.source);
          const target = lookup.get(link.target);
          if (!source || !target) return;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const desired = link.type === 'static' ? 162 : 128;
          const force = (dist - desired) * 0.015;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        });
        nodes.forEach((node) => {
          if (node.fixed) return;
          node.vx += (width / 2 - node.x) * 0.002;
          node.vy += (height * 0.42 - node.y) * 0.002;
          node.vx *= 0.78;
          node.vy *= 0.78;
          node.x = Math.min(width - 46, Math.max(46, node.x + node.vx));
          node.y = Math.min(height - 46, Math.max(46, node.y + node.vy));
        });
      }
    };

    const paint = () => {
      const nodes = activeNodes();
      const links = activeLinks();
      tick(nodes, links);
      svg.innerHTML = '';
      const lookup = new Map(nodes.map((node) => [node.id, node]));
      const linkLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      linkLayer.setAttribute('class', 'graph-links');
      svg.appendChild(linkLayer);
      links.forEach((link) => {
        const source = lookup.get(link.source);
        const target = lookup.get(link.target);
        if (!source || !target) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(source.x));
        line.setAttribute('y1', String(source.y));
        line.setAttribute('x2', String(target.x));
        line.setAttribute('y2', String(target.y));
        const isSelectedLink = selectedId && (link.source === selectedId || link.target === selectedId);
        line.setAttribute('class', `graph-link ${link.type}${isSelectedLink ? ' selected-link' : ''}`);
        linkLayer.appendChild(line);
      });
      const nodeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      svg.appendChild(nodeLayer);
      nodes.forEach((node) => {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', `graph-node ${selectedId === node.id ? 'selected' : ''}`);
        group.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.setAttribute('aria-label', `${node.name}, ${node.title}`);
        const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreign.setAttribute('x', '-24');
        foreign.setAttribute('y', '-24');
        foreign.setAttribute('width', '48');
        foreign.setAttribute('height', '48');
        const face = document.createElement('div');
        face.className = `node-face ${node.structural ? 'structural-face' : ''} ${node.event ? 'event-face' : ''}`;
        if (node.logo) {
          const img = document.createElement('img');
          img.src = node.logo;
          img.alt = '';
          face.appendChild(img);
        } else if (node.event) {
          face.textContent = node.id === 'Disaster EXPO' ? 'EX' : 'IM';
        } else if (node.flagUrl) {
          const img = document.createElement('img');
          img.src = node.flagUrl;
          img.alt = '';
          face.appendChild(img);
        }
        foreign.appendChild(face);
        group.appendChild(foreign);
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('y', '38');
        label.setAttribute('text-anchor', 'middle');
        label.textContent = node.hideLabel ? '' : node.name;
        if (!node.hideLabel) group.appendChild(label);
        group.addEventListener('click', (event) => {
          event.stopPropagation();
          selectedId = selectedId === node.id ? null : node.id;
          renderDetails(selectedId ? lookup.get(selectedId) || null : null);
          paint();
        });
        nodeLayer.appendChild(group);
      });
    };

    const onSvgClick = () => {
      selectedId = null;
      renderDetails(null);
      paint();
    };
    svg.addEventListener('click', onSvgClick);
    this.cleanups.push(() => svg.removeEventListener('click', onSvgClick));
    this.listen(window, 'resize', () => requestAnimationFrame(paint));
    paint();
  }
}
