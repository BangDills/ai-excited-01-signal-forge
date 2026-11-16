// SPDX-License-Identifier: MIT
// THE LIGHTHOUSE CATCH — original procedural illustration, no assets or dependencies.
// Coordinates are in a 1024 square. Two samples per axis keep the cut-paper edges clean.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024, H = 1024, SS = 2, SW = W * SS, SH = H * SS;
const pixels = new Uint8Array(SW * SH * 3);
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp(t));
const rgb = h => h.match(/\w\w/g).map(s => parseInt(s, 16));
const ink = rgb('071c2a'), cream = rgb('fff1c7'), coral = rgb('f35c36');
let seed = 0x4c494748;
function rand() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
function put(x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = (y * SW + x) * 3;
  const a = clamp(alpha);
  for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(pixels[i + c] * (1 - a) + color[c] * a);
}
function paint(points, color, alpha = 1) {
  const p = points.map(([x, y]) => [x * SS, y * SS]);
  const ymin = Math.max(0, Math.floor(Math.min(...p.map(v => v[1]))));
  const ymax = Math.min(SH - 1, Math.ceil(Math.max(...p.map(v => v[1]))));
  for (let y = ymin; y <= ymax; y++) {
    const crossings = [], cy = y + 0.5;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[i], b = p[j];
      if ((a[1] > cy) !== (b[1] > cy)) crossings.push(a[0] + (cy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const start = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const end = Math.min(SW - 1, Math.floor(crossings[k + 1] - 0.5));
      for (let x = start; x <= end; x++) {
        const c = typeof color === 'function' ? color(x / SS, y / SS) : color;
        put(x, y, c, alpha);
      }
    }
  }
}
function path(data, color, alpha = 1) {
  const tokens = data.match(/[MLCQZ]|-?\d*\.?\d+/g);
  let i = 0, p = [], current = [0, 0];
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      current = [+tokens[i++], +tokens[i++]]; p.push(current);
    } else if (cmd === 'C') {
      const a = current, b = [+tokens[i++], +tokens[i++]], c = [+tokens[i++], +tokens[i++]], d = [+tokens[i++], +tokens[i++]];
      const length = Math.hypot(b[0]-a[0], b[1]-a[1]) + Math.hypot(c[0]-b[0], c[1]-b[1]) + Math.hypot(d[0]-c[0], d[1]-c[1]);
      const n = Math.max(8, Math.ceil(length / 6));
      for (let j = 1; j <= n; j++) {
        const t = j/n, s = 1-t;
        p.push([s*s*s*a[0]+3*s*s*t*b[0]+3*s*t*t*c[0]+t*t*t*d[0], s*s*s*a[1]+3*s*s*t*b[1]+3*s*t*t*c[1]+t*t*t*d[1]]);
      }
      current = d;
    } else if (cmd === 'Q') {
      const a = current, b = [+tokens[i++], +tokens[i++]], c = [+tokens[i++], +tokens[i++]];
      for (let j = 1; j <= 24; j++) {
        const t = j/24, s = 1-t; p.push([s*s*a[0]+2*s*t*b[0]+t*t*c[0], s*s*a[1]+2*s*t*b[1]+t*t*c[1]]);
      }
      current = c;
    } else if (cmd === 'Z') { paint(p, color, alpha); p = []; }
    else throw new Error('Unknown drawing command: ' + cmd);
  }
  if (p.length) paint(p, color, alpha);
}
function ellipse(x, y, rx, ry, color, angle = 0, alpha = 1) {
  const p = [], c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < 80; i++) {
    const a = i * Math.PI / 40, u = Math.cos(a)*rx, v = Math.sin(a)*ry;
    p.push([x+u*c-v*s, y+u*s+v*c]);
  }
  paint(p, color, alpha);
}
function line(points, width, color, alpha = 1) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i], dx=b[0]-a[0], dy=b[1]-a[1], d=Math.hypot(dx,dy);
    if (!d) continue;
    const nx=-dy/d*width/2, ny=dx/d*width/2;
    paint([[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]],color,alpha);
    ellipse(b[0],b[1],width/2,width/2,color,0,alpha);
  }
}
function curve(a,b,c,d,width,color,alpha=1) {
  const p=[];
  for(let i=0;i<=60;i++) { const t=i/60,s=1-t;p.push([s*s*s*a[0]+3*s*s*t*b[0]+3*s*t*t*c[0]+t*t*t*d[0],s*s*s*a[1]+3*s*s*t*b[1]+3*s*t*t*c[1]+t*t*t*d[1]]); }
  line(p,width,color,alpha);
}
const vertical = (a,b,y0,y1) => (x,y) => mix(a,b,(y-y0)/(y1-y0));
const radial = (a,b,cx,cy,rx,ry) => (x,y) => mix(a,b,Math.hypot((x-cx)/rx,(y-cy)/ry));

// Storm: cool open space behind the strong warm diagonal.
for (let y=0;y<SH;y++) for(let x=0;x<SW;x++) {
  const xx=x/SS, yy=y/SS;
  const light=Math.exp(-(((xx-628)/490)**2+((yy-310)/450)**2));
  const c=mix(rgb('071c2c'),rgb('38636b'),light*0.8);
  const horizon=Math.exp(-(((yy-600)/110)**2))*0.19;
  put(x,y,mix(c,rgb('86a8a2'),horizon));
}
path('M0 145 C180 222 257 79 439 126 C530 152 559 190 667 147 C789 88 914 62 1024 107 L1024 0 L0 0 Z',rgb('102935'));
path('M0 173 C176 249 278 157 417 181 C318 213 281 255 144 252 C76 253 32 231 0 238 Z',rgb('29434b'),0.6);
path('M708 75 C839 33 956 54 1024 95 L1024 145 C881 93 805 137 708 146 Z',rgb('213f48'));
path('M0 381 C195 319 232 349 373 285 C264 388 145 393 0 441 Z',rgb('5a7778'),0.17);
// Wind-carved cloud rims echo the diagonal without filling the focal negative space.
path('M0 317 C113 333 155 294 242 277 C319 261 366 280 433 264 C344 299 318 284 253 301 C150 325 95 361 0 345 Z',rgb('658183'),0.15);
path('M763 378 C850 347 883 291 1024 269 L1024 289 C896 306 874 361 763 390 Z',rgb('78928d'),0.14);
curve([45,411],[175,390],[238,350],[302,341],1.5,rgb('76978f'),0.18);
// Distant headlands and a sparse harbour establish scale without competing with the catch.
path('M0 591 L57 570 L97 579 L143 551 L194 568 L251 553 L299 582 L349 577 L385 615 L0 664 Z',rgb('1a414a'));
path('M0 613 L176 607 L227 592 L270 603 L280 623 L0 652 Z',rgb('31535a'));
for(let i=0;i<13;i++) {
  const x=11+i*19,y=596+rand()*12;
  paint([[x,y],[x+7,y-7],[x+14,y-2],[x+14,y+12],[x,y+14]],rgb('0c2d3a'));
  if(i%3===0) line([[x+7,y+3],[x+8,y+6]],2,rgb('dbbd83'),0.6);
}
// The dark sea and its long, converging wakes.
path('M0 656 C218 598 375 648 566 588 C771 525 885 556 1024 500 L1024 1024 L0 1024 Z',vertical(rgb('144550'),rgb('071e2f'),555,1024));
for(let i=0;i<70;i++) {
  const y=600+rand()*405,x=rand()*1100-100,len=30+rand()*150;
  curve([x,y],[x+len*.4,y-9],[x+len*.7,y-8],[x+len,y-17],0.6+rand()*2,rgb('4a9297'),0.08+rand()*0.16);
}
// Broken pedestal at left; its torn edge and falling masonry point to the rescue.
path('M0 527 L80 523 L115 501 L167 513 L198 489 L242 509 L249 543 L229 569 L252 605 L204 628 L163 675 L0 746 Z',rgb('102b38'));
path('M0 528 L83 525 L117 505 L168 515 L199 494 L242 511 L246 537 L212 550 L157 543 L96 563 L0 562 Z',rgb('52706b'));
paint([[171,502],[199,476],[233,482],[242,511],[217,527],[184,518]],rgb('b0b1a0'));
paint([[199,476],[208,490],[199,505],[217,514],[233,482]],rgb('ded5b8'));
path('M0 596 L87 563 L147 558 L109 585 L125 632 L78 652 L60 710 L0 741 Z',rgb('23424a'));
for(const [x,y,s] of [[259,547,14],[298,581,9],[325,634,18],[270,664,7],[380,650,11]]) {
  paint([[x-s,y],[x,y-s*.6],[x+s,y+s*.4],[x-s*.2,y+s]],rgb('71847e'));
  paint([[x-s,y],[x,y-s*.6],[x+3,y+s*.2],[x-s*.2,y+s]],rgb('b9bba2'));
}
// Broad foam sweep: a wave lifts the crab from lower left toward upper right.
path('M0 924 C148 792 229 799 312 700 C374 631 433 627 517 638 C415 652 398 691 401 738 C350 784 392 834 445 844 C326 861 312 920 267 962 C173 986 98 1017 0 1024 Z',rgb('195561'));
path('M0 925 C144 823 236 802 318 714 C369 658 415 640 473 643 C378 678 390 723 346 763 C258 808 240 861 177 892 C121 920 81 956 0 992 Z',rgb('32858a'));
path('M0 925 C169 803 241 799 321 706 C370 657 410 643 473 643 C394 664 369 705 349 738 C281 765 259 807 224 827 C153 850 61 911 0 958 Z',rgb('b2d7c9'));
path('M0 925 C148 828 237 804 314 719 C279 785 230 831 173 846 C92 884 38 925 0 948 Z',cream);
// The rising wall of displaced water sits behind the animal, separating its silhouette.
path('M350 784 C421 765 439 722 457 690 C485 643 529 639 569 657 C610 681 638 710 696 696 C756 678 816 609 887 564 C862 614 855 661 904 679 C945 689 984 665 1024 640 L1024 724 C968 764 932 755 881 742 C802 716 805 752 759 773 L650 826 L485 844 Z',rgb('256b75'));
path('M696 696 C761 671 810 611 887 564 C850 603 835 644 858 667 C873 683 900 687 920 679 C882 711 853 695 822 692 C778 695 744 723 709 731 Z',rgb('5ba7a7'));
path('M744 678 C798 643 832 592 887 564 C847 600 844 628 838 648 C812 637 790 672 770 684 Z',rgb('d3e9d5'));
path('M831 611 C851 584 866 577 887 564 C871 583 864 597 859 610 L852 606 L844 620 Z',cream);
path('M908 680 C952 673 986 653 1024 615 L1024 640 C990 673 949 696 908 695 Z',rgb('a7d3c9'));
// Individual ribbons and droplets follow the same diagonal as the lifted tower.
curve([780,674],[822,600],[892,527],[973,512],4,rgb('7cbbb6'),0.8);
curve([836,617],[865,567],[914,550],[952,549],2,rgb('d6e5ce'),0.9);
for(let i=0;i<75;i++) {
  const t=rand(), x=724+t*280+(rand()-.5)*75, y=684-t*172+(rand()-.5)*58;
  const r=1+rand()*3.8;
  ellipse(x,y,r*.55,r*1.8,i%4===0?cream:rgb('94c8c4'),0.68,0.4+rand()*.6);
}
// Large rear limbs disappear behind body and surf.
path('M690 691 C771 625 830 598 851 615 L928 718 L1015 755 L1024 785 L914 752 L829 665 L751 745 Z',rgb('882e34'));
path('M742 726 L857 700 L966 857 L941 898 L836 745 L755 780 Z',rgb('ac3938'));
paint([[785,747],[854,756],[902,939],[871,972],[824,792],[761,803]],rgb('672a36'));
line([[760,697],[828,637],[842,642],[916,731],[1004,768]],8,rgb('e5704a'));
line([[790,731],[849,723],[948,863]],9,rgb('f5794c'));
// Main claw's arm, rising in a strong S toward the falling tower.
path('M580 712 C523 710 485 676 464 618 L424 529 C412 497 431 471 454 477 C487 482 495 527 515 564 L568 610 C601 631 630 673 610 700 Z',rgb('792b35'));
path('M574 679 C512 664 505 627 483 580 L446 503 C438 487 453 484 465 496 L507 566 C531 598 563 597 590 635 Z',vertical(rgb('ff9b57'),rgb('d94835'),482,692));
path('M474 553 L490 565 L513 612 L502 630 L487 611 Z',rgb('ffcf83'));
// Back jaw of the enormous catching pincer, with an open negative-space crescent.
path('M433 551 C379 534 355 499 360 448 C364 401 400 355 452 344 C424 371 410 405 417 434 C423 458 443 463 473 450 C495 441 515 420 531 400 C548 453 536 505 502 533 C483 549 459 558 433 551 Z',rgb('6f2834'));
path('M431 535 C391 521 371 484 376 446 C382 404 408 373 439 360 C418 394 406 430 423 451 C439 472 464 473 494 454 L524 421 C531 468 515 505 486 524 C468 537 449 540 431 535 Z',radial(rgb('ffb061'),rgb('d64433'),408,397,155,190));
path('M385 451 C389 418 411 385 439 360 C405 371 377 409 376 446 C373 479 385 503 405 515 C389 493 385 471 385 451 Z',rgb('ffe2a0'));

// Lighthouse geometry is defined in a falling local frame, tilted 32 degrees.
const base=[500,526], ang=0.55, cs=Math.cos(ang), sn=Math.sin(ang);
const T=(u,v)=>[base[0]+u*cs-v*sn,base[1]+u*sn+v*cs];
function towerPoly(p,c,a=1){paint(p.map(v=>T(...v)),c,a);}
function towerLine(p,w,c,a=1){line(p.map(v=>T(...v)),w,c,a);}
// A broad lantern beam cuts across storm clouds, not a bloom or an explosion.
paint([T(-25,-339),[-100,22],[-100,282],T(-25,-309)],rgb('eed4a0'),0.105);
paint([T(28,-339),[1060,160],[1060,294],T(28,-309)],rgb('ffdc8a'),0.11);
// Plinth and shaft: three confident bands with cool cylindrical shadows.
towerPoly([[-59,5],[58,5],[52,-22],[-54,-22]],rgb('b7b6a0'));
towerPoly([[-51,-15],[50,-15],[31,-284],[-33,-284]],rgb('f5e9c8'));
towerPoly([[22,-15],[50,-15],[31,-284],[12,-284]],rgb('7d9690'));
towerPoly([[-51,-15],[-32,-15],[-22,-284],[-33,-284]],rgb('fff6da'));
towerPoly([[-46,-68],[46,-68],[42,-126],[-42,-126]],rgb('df4a37'));
towerPoly([[24,-68],[46,-68],[42,-126],[19,-126]],rgb('9c3b39'));
towerPoly([[-38,-185],[38,-185],[34,-236],[-35,-236]],rgb('df4a37'));
towerPoly([[17,-185],[38,-185],[34,-236],[14,-236]],rgb('9c3b39'));
for(const v of [-43,-151,-260]) {
  towerPoly([[-8,v],[7,v],[7,v-22],[2,v-28],[-4,v-27],[-8,v-22]],rgb('213f49'));
  towerLine([[-7,v],[-7,v-20],[-3,v-24]],1.6,cream);
}
towerLine([[-39,-38],[-25,-47],[-29,-57],[-15,-64]],1.4,rgb('748d86'));
// Gallery, lantern, copper cap.
towerPoly([[-47,-279],[45,-279],[49,-291],[-51,-291]],rgb('192e36'));
towerPoly([[-35,-295],[34,-295],[32,-346],[-34,-346]],rgb('192e36'));
towerPoly([[-28,-298],[26,-298],[25,-339],[-27,-339]],rgb('ffc878'));
towerPoly([[-23,-300],[0,-300],[0,-338],[-24,-338]],cream);
towerPoly([[8,-300],[23,-300],[23,-338],[8,-338]],rgb('e99143'));
towerLine([[3,-342],[3,-295]],5,rgb('32474a'));
towerPoly([[-42,-347],[41,-347],[26,-368],[0,-381],[-27,-368]],rgb('d7573b'));
towerPoly([[-42,-347],[0,-381],[-10,-355]],rgb('ffa45d'));
towerLine([[0,-380],[0,-393]],4,rgb('b0bfa9'));
for(const u of [-47,-27,27,46])towerLine([[u,-292],[u,-310]],2.5,rgb('8caba4'));
towerLine([[-49,-311],[48,-311]],2.5,rgb('c5c8aa'));
// Keeper: a yellow coat, one hand still clamped to the gallery rail.
towerPoly([[-45,-312],[-49,-326],[-41,-334],[-34,-326],[-31,-314]],rgb('f5bc4d'));
const keeper=T(-42,-337);ellipse(...keeper,5,5,rgb('f3caa0'));
towerLine([[-48,-324],[-57,-319],[-56,-308]],3,rgb('ffcd64'));
towerLine([[-42,-313],[-43,-305]],3,ink);
// Front jaw overlaps the base: this occlusion makes the catch physically legible.
path('M434 549 C466 577 512 562 536 529 C565 491 563 449 550 422 C548 458 534 481 515 491 C502 499 494 486 483 481 C462 470 441 486 432 504 C426 518 425 537 434 549 Z',rgb('8c3036'));
path('M441 540 C469 558 504 544 525 517 C543 492 551 461 550 438 C542 470 529 492 511 500 C491 509 487 489 473 490 C453 491 438 507 436 521 Z',radial(rgb('ffb465'),rgb('eb5038'),456,503,110,100));
path('M443 510 C450 495 462 490 475 491 C488 492 492 509 507 507 C477 526 460 510 453 531 L441 540 C433 528 435 520 443 510 Z',rgb('ffda8f'));
for(const [x,y,s] of [[486,502,5],[504,502,5],[523,490,5]])paint([[x-s,y],[x,y-s*2],[x+s,y+2]],rgb('ffe1a1'));
// Body: a low, armoured silhouette rather than a circular mascot.
path('M498 701 L515 665 L539 664 L552 641 L581 647 L609 630 L639 642 L666 634 L691 652 L721 653 L737 676 L766 683 L762 715 L780 733 L758 751 L762 774 L730 783 L713 805 L679 803 L650 820 L623 805 L593 813 L573 791 L546 789 L539 769 L511 757 Z',rgb('782b35'));
path('M512 701 C523 661 564 649 608 649 C664 640 732 662 754 705 C779 747 729 788 666 797 C606 803 538 770 520 741 Z',radial(rgb('ff9854'),rgb('c53a36'),581,670,230,155));
path('M516 699 C535 667 578 660 607 663 C661 653 712 674 737 696 C690 681 649 681 613 691 C570 686 542 697 524 716 Z',rgb('ffc27a'));
path('M527 736 C577 761 620 773 668 761 C713 756 742 741 757 718 C753 770 704 790 663 795 C610 799 555 773 527 736 Z',rgb('ab3336'));
curve([543,701],[595,680],[668,683],[724,708],3,rgb('ad3939'));
curve([550,710],[603,692],[663,697],[706,715],2,rgb('ffe0a0'),0.8);
// Four visible walking legs have hard bends, tapered tips, and distinct depth planes.
path('M566 759 L511 778 L443 893 L422 934 L437 914 L485 883 L535 811 L590 796 Z',rgb('c14337'));
path('M607 787 L565 828 L581 951 L618 1002 L615 967 L601 856 L642 812 Z',rgb('ec5a3b'));
path('M684 785 L716 839 L813 889 L888 967 L871 924 L820 854 L749 812 L729 773 Z',rgb('da4937'));
path('M738 744 L797 768 L890 743 L994 805 L1024 810 L1006 790 L905 712 L807 730 L755 711 Z',rgb('f16c42'));
line([[553,784],[520,798],[468,888]],7,rgb('ffac64'));
line([[617,812],[583,845],[598,947]],7,rgb('ffd18a'));
line([[716,805],[735,827],[814,871],[858,920]],7,rgb('ffb66c'));
line([[776,751],[805,752],[901,729],[989,789]],7,rgb('ffcf85'));
// The small counter-claw is flung wide with the force of the catch.
path('M738 695 C770 655 789 631 827 626 L865 643 L891 620 C899 645 881 671 858 675 C839 680 830 659 816 661 L774 727 Z',rgb('c44038'));
path('M810 633 C823 604 854 589 879 597 C859 601 850 613 848 627 L870 638 L884 626 C887 649 872 662 858 661 L836 645 Z',rgb('ff9453'));
// A few hard shell glints connect the lantern's warm light to the raised claw.
curve([449,587],[461,612],[471,629],[487,641],2.7,rgb('ffcf81'));
curve([402,415],[400,436],[403,447],[411,456],2,rgb('fff0b3'));
curve([538,488],[533,510],[523,523],[508,534],2,rgb('ffb56e'));
// Eye stalks look up at the tower, underlining the story at full size.
line([[573,674],[560,640],[550,623]],12,rgb('a83a36'));
line([[620,663],[612,626],[599,610]],12,rgb('d54b38'));
ellipse(550,620,12,14,ink,-0.2);ellipse(599,607,13,15,ink,-0.2);
ellipse(546,616,4,5,cream);ellipse(595,602,4,5,cream);
// Foreground rocks and a curling sheet of water give a near, middle, far rhythm.
path('M0 1024 L0 993 L98 963 L145 972 L221 941 L278 964 L301 1024 Z',rgb('071d2a'));
path('M824 1024 L863 985 L899 993 L934 942 L984 925 L1024 937 L1024 1024 Z',rgb('0a2530'));
path('M0 995 L96 968 L143 979 L218 948 L269 965 L200 966 L152 992 L102 983 L38 1005 Z',rgb('396167'));
// Near water overlaps the feet: weight, impact, and a foreground plane.
path('M306 1024 C378 955 455 963 492 922 C511 898 502 867 477 859 C514 849 541 865 547 889 C558 932 516 952 493 974 C560 974 635 962 687 985 C733 1004 772 1000 819 969 C877 932 935 947 1024 903 L1024 975 C921 1009 911 985 861 1013 L841 1024 Z',rgb('287680'));
path('M321 1024 C394 972 469 970 507 926 C531 899 514 869 477 859 C519 851 544 876 535 905 C528 935 503 948 476 966 C557 949 642 956 686 979 C744 1009 801 976 835 965 C900 943 953 951 1024 911 L1024 931 C949 969 901 959 852 980 C792 1007 754 1024 704 1001 C638 973 561 979 512 993 C451 1005 388 1008 366 1024 Z',rgb('a9d4c8'));
path('M477 859 C516 853 544 880 530 908 C521 928 505 941 476 954 C499 934 511 919 513 901 C516 879 503 870 477 859 Z',cream);
path('M729 1006 C803 1010 816 962 889 959 C935 957 969 949 1024 922 L1024 935 C960 965 926 970 890 970 C830 974 797 1024 743 1024 Z',rgb('edf0d5'));
// Spray separates feet from the sea without obscuring their hard angular bends.
for(let i=0;i<105;i++) {
  const x=350+rand()*670,y=840+rand()*177;
  const front=(x<560||x>819), a=front?.75:.35;
  const r=.7+rand()*2.9;
  ellipse(x,y,r*1.6,r*.6,i%3===0?cream:rgb('79b5b4'),-0.4,a);
}
for(const [x,y] of [[443,889],[583,944],[813,883],[942,891]]) {
  curve([x-27,y+17],[x-10,y-5],[x+8,y-7],[x+30,y-26],3,rgb('e0ecd4'));
  curve([x-19,y+14],[x-37,y-17],[x-32,y-27],[x-37,y-36],2,rgb('8ebfba'));
  ellipse(x-37,y-43,2,4,cream,-0.4);
}
// Isolated flying fragments suggest the arrested fall; no radial burst distracts from it.
for(const [x,y,s] of [[333,432,11],[311,481,7],[372,587,8],[302,534,4],[398,329,5]]) {
  paint([[x-s,y-s/2],[x+s*.3,y-s],[x+s,y+s],[x-s*.5,y+s*.6]],rgb('b3b8a3'));
  paint([[x-s,y-s/2],[x+s*.3,y-s],[x,y+s*.3]],cream);
}
curve([282,424],[292,451],[306,467],[316,480],1.6,rgb('b6c5b1'),0.4);
curve([337,552],[344,567],[349,577],[360,585],1.4,rgb('b6c5b1'),0.45);
// Shell freckles are sparse and follow its volume; the silhouette carries the design.
for(let i=0;i<64;i++) {
  const x=540+rand()*188,y=687+rand()*66;
  if(((x-628)/104)**2+((y-720)/39)**2<1)ellipse(x,y,.7+rand()*1.4,.5+rand()*.8,rgb('aa3d38'),0,.34);
}
// Very light deterministic paper grain avoids plastic-flat colour at full resolution.
for(let y=0;y<SH;y++)for(let x=0;x<SW;x++) {
  const i=(y*SW+x)*3;
  const hash=(Math.imul(x+17,374761393)^Math.imul(y+53,668265263))>>>0;
  const g=((hash^(hash>>>13))&15)-7;
  for(let c=0;c<3;c++)pixels[i+c]=clamp(pixels[i+c]+g*.13,0,255);
}

function crc32(b) {
  let c = 0xffffffff;
  for (const v of b) {
    c ^= v;
    for (let j=0;j<8;j++) c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t=Buffer.from(type), out=Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length,0);t.copy(out,4);data.copy(out,8);
  out.writeUInt32BE(crc32(Buffer.concat([t,data])),data.length+8);return out;
}
function encodePNG() {
  const stride=W*3, raw=Buffer.alloc((stride+1)*H), previous=new Uint8Array(stride);
  for(let y=0;y<H;y++) {
    const row=new Uint8Array(stride);
    for(let x=0;x<W;x++) for(let c=0;c<3;c++) {
      let sum=0;
      for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++)sum+=pixels[(((y*SS+sy)*SW+x*SS+sx)*3)+c];
      row[x*3+c]=Math.round(sum/(SS*SS));
    }
    // PNG filter Up produces compact output for softly shaded vector artwork.
    raw[y*(stride+1)]=2;
    for(let i=0;i<stride;i++)raw[y*(stride+1)+1+i]=(row[i]-previous[i]+256)&255;
    previous.set(row);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const output=process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(output,{recursive:true});
const png=encodePNG();
if(png.length>1048576)throw new Error('Image exceeds one MiB');
writeFileSync(join(output,'entry.png'),png);
console.log(`The Lighthouse Catch: ${W}×${H}, ${png.length} bytes`);
