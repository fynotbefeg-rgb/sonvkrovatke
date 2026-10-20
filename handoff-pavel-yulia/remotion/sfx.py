# Синтез звука для интро (5 с): usage sfx.py out.wav A|B
import sys, numpy as np, wave
SR=48000; D=5.0; N=int(SR*D); t=np.arange(N)/SR
rng=np.random.default_rng({"A":7,"B":11,"C":5,"D":3}[sys.argv[2]])
out=np.zeros((N,2))
def env(a,d,s0,len_):
    e=np.zeros(N); i0=int(s0*SR); n=int(len_*SR); x=np.arange(n)/SR
    seg=np.minimum(1,x/a)*np.exp(-x/d); e[i0:i0+n]=seg[:N-i0]; return e
def lp(x,c):  # one-pole lowpass with time-varying cutoff array
    y=np.zeros_like(x); a=np.exp(-2*np.pi*c/SR); acc=0
    for i in range(len(x)): acc=(1-a[i])*x[i]+a[i]*acc; y[i]=acc
    return y
def whoosh(s0,len_,pan=0,g=0.5):
    n=rng.standard_normal(N); c=np.full(N,200.0); i0=int(s0*SR); n_=int(len_*SR)
    c[i0:i0+n_]=200+6000*np.sin(np.linspace(0,np.pi,n_))**2
    w=lp(n,c)*env(len_*0.6,len_*0.25,s0,len_*1.6)*g
    out[:,0]+=w*(1-pan); out[:,1]+=w*(1+pan)
def hit(s0,f0=55,g=0.9):
    e=env(0.003,0.35,s0,1.5); ph=2*np.pi*np.cumsum(f0+120*np.exp(-(t-s0).clip(0)*25))/SR
    out[:]+=(np.sin(ph)*e*g)[:,None]
def pluck(s0,f,g=0.18,pan=0):
    e=env(0.002,0.5,s0,2.5); x=(np.sin(2*np.pi*f*t)+0.4*np.sin(4*np.pi*f*t)+0.2*np.sin(6*np.pi*f*t))*e*g
    out[:,0]+=x*(1-pan); out[:,1]+=x*(1+pan)
def pad(f_list,s0,g=0.05):
    e=np.clip((t-s0)/0.8,0,1)*np.clip((D-t)/0.6,0,1)
    for k,f in enumerate(f_list):
        x=(np.sin(2*np.pi*f*t+k)+0.3*np.sin(2*np.pi*f*1.003*t))*e*g
        out[:,0]+=x; out[:,1]+=x*0.9
if sys.argv[2]=="A":
    whoosh(0.0,0.7,-0.4,0.35); whoosh(0.15,0.6,0.4,0.3); hit(0.42,52,0.8)
    for k,f in enumerate([523.25,659.25,783.99,1046.5]): pluck(0.6+k*0.16,f,0.13,(-0.5+k*0.33))
    pad([261.63,329.63,392.0,523.25],0.45,0.035)
    for k in range(4): pluck(1.0+k*0.12,1568+k*200,0.04,0.3)
elif sys.argv[2]=="B":
    whoosh(0.0,0.35,0,0.5); hit(0.18,48,1.0)
    for k in range(7): whoosh(0.2+k*0.06,0.25,(-1)**k*0.6,0.12)
    for k,f in enumerate([440,554.37,659.25,880,1108.7]): pluck(0.9+k*0.1,f,0.11,(-0.6+k*0.3))
    pad([220,277.18,329.63,440],0.3,0.035)
    hit(1.9,70,0.25)
if sys.argv[2]=="C":  # интро A раунд 2: фото въезжает, второе фото на 1.8 с
    whoosh(0.05,0.6,0.5,0.35); hit(0.4,55,0.6); whoosh(1.55,0.5,0.6,0.25); hit(1.85,62,0.35)
    for k,f in enumerate([392.0,493.88,587.33,783.99]): pluck(0.85+k*0.14,f,0.12,(-0.5+k*0.33))
    pad([196.0,246.94,293.66,392.0],0.35,0.035)
if sys.argv[2]=="D":  # интро B раунд 2: рамка прорисовывается, текст по центру
    whoosh(0.0,0.5,-0.5,0.3); whoosh(0.1,0.5,0.5,0.3)
    for k,f in enumerate([329.63,415.3,493.88,659.25,830.61]): pluck(0.5+k*0.2,f,0.11,(-0.6+k*0.3))
    hit(1.05,50,0.5); pad([164.81,207.65,246.94,329.63],0.3,0.04)
out*=0.9/np.max(np.abs(out)); out[-int(0.05*SR):]*=np.linspace(1,0,int(0.05*SR))[:,None]
w=wave.open(sys.argv[1],"wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out*32767).astype(np.int16).tobytes()); w.close()
