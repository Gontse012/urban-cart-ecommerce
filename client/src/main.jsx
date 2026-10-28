import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ShoppingBag, ArrowUpRight, Plus, Minus, X, Menu, Check, ChevronDown, ShieldCheck, Truck, RotateCcw, Sparkles, UserRound, PackageCheck } from 'lucide-react';
import './styles.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '').replace(/\/$/, '') + '/api';
const fallbackProducts = [
 {id:1,name:'Studio Wireless Headphones',category:'Tech',description:'Immersive sound, comfortable fit and all-day battery life.',price:1299,image_url:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',stock:25},
 {id:2,name:'Minimal Desk Lamp',category:'Home',description:'A warm, modern lamp for your workspace or bedside table.',price:649,image_url:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',stock:18},
 {id:3,name:'Everyday Canvas Backpack',category:'Lifestyle',description:'A durable everyday backpack with a clean, versatile design.',price:899,image_url:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85',stock:20},
 {id:4,name:'Classic Sunglasses',category:'Accessories',description:'Timeless frames made for sunny days and daily wear.',price:499,image_url:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85',stock:30},
 {id:5,name:'Smart Watch',category:'Tech',description:'Track your activity and stay connected throughout the day.',price:1599,image_url:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',stock:12},
 {id:6,name:'Ceramic Coffee Set',category:'Home',description:'A considered ceramic set for your everyday coffee ritual.',price:379,image_url:'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85',stock:16},
 {id:7,name:'Everyday Sneakers',category:'Lifestyle',description:'Comfort-first sneakers with a simple, versatile silhouette.',price:1099,image_url:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',stock:14},
 {id:8,name:'Reusable Travel Bottle',category:'Accessories',description:'A reusable bottle to keep your favourite drink close at hand.',price:249,image_url:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',stock:40}
];
const fmt = n => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:2}).format(Number(n||0));
async function api(path, options={}) { 
  const token=localStorage.getItem('uc_token'); 
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(options.headers||{})}}); 
  const data=await res.json().catch(()=>({})); 
  if(!res.ok) throw new Error(data.error||`Request failed: ${res.status}`); 
  return data; 
}

function ProductPage({ product, onClose, onAdd, onOpenCart }) {
  const [qty, setQty] = useState(1);
  if (!product) return null;
  return (
    <div className="wrap product-page" style={{paddingTop:'24px', paddingBottom:'60px'}}>
      <button className="btn btn-outline" onClick={onClose} style={{marginBottom:24, display:'inline-flex', alignItems:'center', gap:8}}>
        <X size={16}/> Back to shop
      </button>
      <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:'32px'}} className="product-page-grid">
        <div className="product-image-wrap" style={{height:'520px', borderRadius:'24px', overflow:'hidden', background:'#f5f3f0'}}>
          <img src={product.image_url} alt={product.name} style={{width:'100%', height:'100%', objectFit:'cover'}}/>
        </div>
        <div>
          <div className="eyebrow"><span className="eyebrow-line"/> {String(product.category||'EVERYDAY').toUpperCase()}</div>
          <h1 style={{fontSize:'42px', margin:'12px 0', lineHeight:'1.1', fontWeight:300}}>{product.name}</h1>
          <p style={{opacity:.7, marginBottom:16, lineHeight:'1.6'}}>{product.description}</p>
          <strong style={{fontSize:'28px', display:'block', marginBottom:24}}>{fmt(product.price)}</strong>
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:24}}>
            <span>Qty:</span>
            <div className="quantity">
              <button onClick={()=>setQty(q=>Math.max(1,q-1))}><Minus size={13}/></button>
              <span style={{minWidth:20, textAlign:'center'}}>{qty}</span>
              <button onClick={()=>setQty(q=>Math.min(99,q+1))}><Plus size={13}/></button>
            </div>
            <small style={{opacity:.6}}>{product.stock} in stock</small>
          </div>
          <button className="btn btn-primary full" style={{width:'100%', justifyContent:'center'}} onClick={()=>{
            for(let i=0;i<qty;i++) onAdd(product);
            onClose();
            onOpenCart();
          }}>
            Add {qty} to bag · {fmt(product.price * qty)} <ShoppingBag size={16}/>
          </button>
          <div style={{marginTop:32, display:'grid', gap:12, fontSize:14}}>
            <div style={{display:'flex', gap:8, alignItems:'center'}}><Truck size={18}/> <strong>Delivery across SA</strong> <small>· Tracked to your door</small></div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}><ShieldCheck size={18}/> <strong>Secure checkout</strong> <small>· PayFast</small></div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}><RotateCcw size={18}/> <strong>Easy returns</strong> <small>· Here when you need us</small></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AllProductsPage({ products, onOpenProduct, onAdd }) {
  return (
    <div className="wrap" style={{paddingTop:24, paddingBottom:60}}>
      <button className="btn btn-outline" onClick={()=>window.history.back()} style={{marginBottom:24, display:'inline-flex', gap:8}}><X size={16}/> Back</button>
      <div className="section-top"><div><div className="eyebrow"><span className="eyebrow-line"/> ALL PRODUCTS</div><h2 style={{fontSize:42, fontWeight:300}}>Every <em>thing.</em></h2><p>{products.length} curated products for everyday living.</p></div></div>
      <div className="product-grid">
        {products.map((p,i)=><article className="product-card" key={p.id} onClick={()=>onOpenProduct(p)} style={{cursor:'pointer'}}><div className="product-image-wrap"><img src={p.image_url} alt={p.name} loading="lazy"/><span className="product-label">{p.category?.toUpperCase()}</span><button className="quick-add" onClick={(e)=>{e.stopPropagation(); onAdd(p);}}><Plus size={19}/></button></div><div className="product-info"><div><h3>{p.name}</h3><p>{p.category}</p></div><strong>{fmt(p.price)}</strong></div></article>)}
      </div>
    </div>
  )
}

function App(){
 const [products,setProducts]=useState(fallbackProducts),[category,setCategory]=useState('All'),[search,setSearch]=useState(''),[cart,setCart]=useState(()=>JSON.parse(localStorage.getItem('uc_cart')||'[]')),[cartOpen,setCartOpen]=useState(false),[checkoutOpen,setCheckoutOpen]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[menuOpen,setMenuOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[authMode,setAuthMode]=useState('login'),[user,setUser]=useState(()=>JSON.parse(localStorage.getItem('uc_user')||'null')),[orders,setOrders]=useState([]),[adminOpen,setAdminOpen]=useState(false),[adminOrders,setAdminOrders]=useState([]),[busy,setBusy]=useState(false),[selectedProduct,setSelectedProduct]=useState(null),[showAll,setShowAll]=useState(false);
 const [form,setForm]=useState({customer_name:'',email:'',phone:'',address:'',city:'',province:'Gauteng',postal_code:''});
 const [authForm,setAuthForm]=useState({name:'',email:'',password:''});
 const categories=['All','Tech','Home','Lifestyle','Accessories'];
 useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('payment')==='return'){
      setCart([]);
      localStorage.removeItem('lastOrderId');
      setNotice(`Payment successful! Order #${params.get('order')} received.`);
    }
    if(params.get('payment')==='cancel'){
      setNotice('Payment cancelled - your cart is saved.');
    }
 },[]);
 useEffect(()=>{localStorage.setItem('uc_cart',JSON.stringify(cart));},[cart]);
 useEffect(()=>{api('/products').then((rows)=>{ if(Array.isArray(rows)&&rows.length) setProducts(rows); }).catch((e)=>{ console.log('Using fallback products, API not reachable:', e.message); }).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(user){setForm(f=>({...f,customer_name:f.customer_name||user.name,email:f.email||user.email}));api('/orders/mine').then(setOrders).catch(()=>{});}},[user]);
 useEffect(()=>{if(notice){const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t);}},[notice]);
 const visible=useMemo(()=>products.filter(p=>(category==='All'|| (p.category||'').toLowerCase()===category.toLowerCase() || p.category===category )&& `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,category,search]);
 const count=cart.reduce((s,p)=>s+p.quantity,0),total=cart.reduce((s,p)=>s+p.price*p.quantity,0);
 const setField=(k,v)=>setForm(f=>({...f,[k]:v}));
 function add(p){setCart(old=>{const found=old.find(x=>x.id===p.id);return found?old.map(x=>x.id===p.id?{...x,quantity:Math.min(x.quantity+1,99)}:x):[...old,{...p,quantity:1}]});setNotice(`${p.name} added to your bag`);}
 function changeQty(id,d){setCart(old=>old.map(p=>p.id===id?{...p,quantity:p.quantity+d}:p).filter(p=>p.quantity>0));}
 function openProduct(p){ setSelectedProduct(p); setShowAll(false); window.scrollTo({top:0, behavior:'smooth'}); }
 function closeProduct(){ setSelectedProduct(null); setShowAll(false); }
 async function submitAuth(e){e.preventDefault();setBusy(true);try{const data=await api(`/auth/${authMode}`,{method:'POST',body:JSON.stringify(authForm)});localStorage.setItem('uc_token',data.token);localStorage.setItem('uc_user',JSON.stringify(data.user));setUser(data.user);setAccountOpen(false);setNotice(`Welcome${data.user.name?`, ${data.user.name.split(' ')[0]}`:''}!`); setAuthForm({name:'',email:'',password:''});}catch(e){setNotice(e.message);}finally{setBusy(false);}}
 function logout(){localStorage.removeItem('uc_token');localStorage.removeItem('uc_user');setUser(null);setOrders([]);setAdminOpen(false);setNotice('You have signed out.');}
 async function placeOrder(e) {
  e.preventDefault();
  if(!form.customer_name.trim()||!form.email.trim()||!form.phone.trim()||!form.address.trim()||!form.city.trim()||!form.postal_code.trim()){
    setNotice('Please fill in all delivery fields.'); return;
  }
  setBusy(true);
  setNotice('');
  try {
    const order = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        items: cart.map(p => ({ id: p.id, quantity: p.quantity }))
      })
    });
    const pay = await api('/payfast/checkout', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.orderId })
    });
    if (!pay.action || !pay.fields) throw new Error('PayFast is not configured yet on server');
    localStorage.setItem('lastOrderId', order.orderId);
    const formEl = document.createElement('form');
    formEl.method = 'POST';
    formEl.action = pay.action;
    formEl.style.display='none';
    Object.entries(pay.fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value ?? '');
      formEl.appendChild(input);
    });
    document.body.appendChild(formEl);
    setCheckoutOpen(false);
    formEl.submit();
  } catch (err) {
    console.error(err);
    setNotice(err.message || 'Could not start PayFast checkout. Check server logs.');
  } finally {
    setBusy(false);
  }
}
 async function showAdmin(){try{const data=await api('/admin/orders');setAdminOrders(data);setAdminOpen(true);}catch(e){setNotice(e.message);}}
 async function updateStatus(id,status){try{await api(`/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});setAdminOrders(old=>old.map(o=>o.id===id?{...o,status}:o));}catch(e){setNotice(e.message);}}
 return <div className="app-shell">
  <div className="announcement"><Sparkles size={13}/> GOOD THINGS, DELIVERED. <span>Free delivery on orders over R1,000</span></div>
  <header className="header wrap"><button className="icon-btn mobile-menu" aria-label="Open menu" onClick={()=>setMenuOpen(!menuOpen)}><Menu/></button><a className="brand" href="#top" onClick={()=>{setCategory('All');setSearch('');closeProduct();}}><span className="brand-mark">u.</span><span>urban<span className="brand-light">cart</span><small>EVERYDAY, ELEVATED.</small></span></a><nav className={menuOpen?'nav nav-open':'nav'}><a href="#shop" onClick={()=>{setMenuOpen(false);closeProduct();setShowAll(false);}}>Shop all</a><a href="#shop" onClick={()=>{setCategory('Tech');setMenuOpen(false);closeProduct();setShowAll(false);}}>Tech</a><a href="#shop" onClick={()=>{setCategory('Home');setMenuOpen(false);closeProduct();setShowAll(false);}}>Home & living</a><a href="#story" onClick={()=>{setMenuOpen(false);closeProduct();setShowAll(false);}}>Our story</a></nav><div className="header-actions"><label className="search-box"><Search size={17}/><input value={search} onChange={e=>{setSearch(e.target.value); if(selectedProduct||showAll){closeProduct();}}} placeholder="Search products..." aria-label="Search products"/></label><button className="icon-btn account-btn" aria-label="Account" onClick={()=>setAccountOpen(true)}><UserRound size={19}/></button><button className="bag-btn" onClick={()=>setCartOpen(true)} aria-label={`Shopping bag, ${count} items`}><ShoppingBag size={19}/><span>Bag</span><b>{count}</b></button></div></header>
  <main id="top">
    {selectedProduct ? (
      <ProductPage product={selectedProduct} onClose={closeProduct} onAdd={add} onOpenCart={()=>setCartOpen(true)} />
    ) : showAll ? (
      <AllProductsPage products={products} onOpenProduct={openProduct} onAdd={add} />
    ) : (
      <>
        <section className="hero wrap"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> THE EVERYDAY EDITION</div><h1>Find your<br/>kind of <em>good.</em></h1><p>Thoughtful finds for the way you live, work and unwind. A little more you, in every detail.</p><div className="hero-buttons"><a className="btn btn-primary" href="#shop">Explore the collection <ArrowUpRight size={17}/></a><a className="text-link" href="#story">Our philosophy <span>↗</span></a></div><div className="hero-note"><div className="avatar-stack"><span>U</span><span>C</span><span>+</span></div><div><strong>Made for everyday living</strong><small>Useful things. Better choices.</small></div></div></div><div className="hero-art"><div className="hero-image" role="img" aria-label="Carefully arranged lifestyle products on a warm neutral background"/><div className="floating-tag" style={{position:'absolute', bottom:24, left:24, background:'#fff', padding:'16px', borderRadius:16}}><span style={{fontSize:10, letterSpacing:'.15em'}}>THE NEW STANDARD</span><br/><strong>Little things.<br/>Big difference.</strong></div></div></section>
        <section className="benefits wrap"><div><Truck/><span><strong>Delivery across SA</strong><small>Tracked to your door</small></span></div><div><ShieldCheck/><span><strong>Secure checkout</strong><small>Payments with PayFast</small></span></div><div><RotateCcw/><span><strong>Easy support</strong><small>Here when you need us</small></span></div><div><PackageCheck/><span><strong>Curated essentials</strong><small>Chosen with intention</small></span></div></section>
        <section id="shop" className="shop-section wrap"><div className="section-top"><div><div className="eyebrow"><span className="eyebrow-line"/> THE GOOD STUFF</div><h2>Everyday <em>favourites.</em></h2><p>Meet the pieces that make the everyday feel a little better.</p></div><button className="text-link desktop-link" style={{background:'none', border:0, cursor:'pointer'}} onClick={()=>{setShowAll(true); window.scrollTo({top:0});}}>View everything <ArrowUpRight size={16}/></button></div><div className="filters"><div className="category-tabs">{categories.map(c=><button key={c} className={category===c?'category active':'category'} onClick={()=>setCategory(c)}>{c}</button>)}</div><span className="result-count">{visible.length} PRODUCTS <ChevronDown size={14}/></span></div>
        {loading&&<div className="loading">Getting the good stuff...</div>}{!loading&&!visible.length&&<div className="empty-results">No products found for "{search}". Try another search.<br/><button className="btn btn-outline" style={{marginTop:12}} onClick={()=>{setSearch(''); setCategory('All');}}>Clear search</button></div>}<div className="product-grid">{visible.map((p,i)=><article className="product-card" key={p.id} onClick={()=>openProduct(p)} style={{cursor:'pointer'}}><div className="product-image-wrap"><img src={p.image_url} alt={p.name} loading="lazy" onError={e=>{e.currentTarget.src='https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=900&q=80'}}/><span className="product-label">{i===0?'BESTSELLER':p.category?.toUpperCase()||'EVERYDAY PICK'}</span><button className="quick-add" onClick={(e)=>{e.stopPropagation(); add(p);}} aria-label={`Add ${p.name} to bag`}><Plus size={19}/></button></div><div className="product-info"><div><h3>{p.name}</h3><p>{p.category||'Everyday essential'}</p></div><strong>{fmt(p.price)}</strong></div></article>)}</div><div className="shop-bottom" style={{display:'flex', justifyContent:'space-between', marginTop:24, fontSize:11, opacity:.5, letterSpacing:'.1em'}}><span>GOOD DESIGN. EVERYDAY PRICES.</span><span>SHOWING {visible.length} OF {products.length} ITEMS</span></div></section>
        <section id="story" className="story wrap" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, padding:'80px 24px'}}><div className="story-art"><div className="story-image" style={{background:'#f0eeeb', height:400, borderRadius:24}} role="img" aria-label="Sunlit, calm and minimal everyday living space"/><span className="story-stamp" style={{fontSize:12, letterSpacing:'.15em'}}>LIVE A LITTLE<br/>MORE INTENTIONALLY</span></div><div className="story-copy"><div className="eyebrow"><span className="eyebrow-line"/> A NOTE FROM US</div><h2 style={{fontSize:42, fontWeight:300}}>Less noise.<br/>More <em>meaning.</em></h2><p>We believe the things around you should earn their place. That's why Urban Cart brings together practical, well-designed finds that feel good to use and easy to love.</p><p>No endless scrolling for the right thing. Just a thoughtful collection for real life, delivered wherever home is in South Africa.</p><a href="#shop" className="btn btn-outline">Find your favourite <ArrowUpRight size={16}/></a></div></section>
        <section className="newsletter wrap" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, padding:'60px 24px', background:'#fff', border:'1px solid #ece9e5', borderRadius:24, margin:'40px 24px'}}><div><div className="eyebrow"><span className="eyebrow-line"/> THE OCCASIONAL GOOD EMAIL</div><h2 style={{fontSize:36, fontWeight:300}}>A little good in<br/>your <em>inbox.</em></h2></div><form onSubmit={e=>{e.preventDefault();setNotice('Thanks for your interest! Newsletter sign-up will be connected when email service is configured.');e.currentTarget.reset()}}><label htmlFor="newsletter-email" style={{fontSize:13, opacity:.7}}>New finds, useful ideas and the occasional treat. No noise.</label><div className="newsletter-input" style={{display:'flex', gap:8, marginTop:12}}><input id="newsletter-email" type="email" placeholder="Your email address" required style={{flex:1, padding:'12px 16px', borderRadius:999, border:'1px solid #ece9e5'}}/><button aria-label="Subscribe" style={{width:44, height:44, borderRadius:'50%', background:'#111', color:'#fff', border:0}}><ArrowUpRight/></button></div><small style={{opacity:.5}}>By subscribing, you agree to receive occasional updates.</small></form></section>
      </>
    )}
  </main>
  <footer className="footer"><div className="wrap footer-main"><div className="footer-brand"><a className="brand" href="#top" style={{color:'#fff'}}><span className="brand-mark" style={{background:'#fff', color:'#111'}}>u.</span><span>urban<span className="brand-light">cart</span><small>EVERYDAY, ELEVATED.</small></span></a><p style={{opacity:.6, marginTop:12, fontSize:14}}>Useful things for living well.<br/>Proudly serving South Africa.</p></div><div><strong>EXPLORE</strong><a href="#shop" onClick={()=>{closeProduct(); setShowAll(false);}}>Shop all</a><a href="#shop" onClick={()=>{setCategory('Tech');closeProduct(); setShowAll(false);}}>Tech</a><a href="#shop" onClick={()=>{setCategory('Home');closeProduct(); setShowAll(false);}}>Home & living</a></div><div><strong>NEED A HAND?</strong><a href="mailto:hello@urbancart.example">Contact us</a><button className="footer-link" onClick={()=>setAccountOpen(true)}>My account</button><button className="footer-link" onClick={()=>user?api('/orders/mine').then(setOrders).catch(e=>setNotice(e.message)):setAccountOpen(true)}>My orders</button></div><div><strong>YOUR DETAILS</strong><span>Prices in South African rand (ZAR)</span><span>PayFast secure checkout</span><span>Delivery across South Africa</span></div></div><div className="wrap footer-bottom"><span>© {new Date().getFullYear()} Urban Cart. All rights reserved.</span><span>MADE FOR THE EVERYDAY <span className="gold-dot" style={{color:'#c9a86a'}}>●</span></span></div></footer>
  {notice&&<div className="toast" role="status"><Check size={17}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss" style={{background:'none', border:0, color:'#fff'}}><X size={15}/></button></div>}
  {cartOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false)}}><aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">YOUR PICKS</span><h2>Your bag <span>({count})</span></h2></div><button className="icon-btn" onClick={()=>setCartOpen(false)} aria-label="Close bag"><X/></button></div>{!cart.length?<div className="cart-empty"><ShoppingBag size={36}/><h3>Your bag is taking a breather.</h3><p>Find something good for your everyday.</p><button className="btn btn-primary" onClick={()=>{setCartOpen(false);document.querySelector('#shop')?.scrollIntoView({behavior:'smooth'})}}>Explore products <ArrowUpRight size={16}/></button></div>:<><div className="cart-items">{cart.map(p=><div className="cart-item" key={p.id}><img src={p.image_url} alt={p.name}/><div className="cart-item-details"><h3>{p.name}</h3><strong>{fmt(p.price)}</strong><div className="quantity"><button onClick={()=>changeQty(p.id,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{p.quantity}</span><button onClick={()=>changeQty(p.id,1)} aria-label="Increase quantity"><Plus size={13}/></button></div></div><button className="remove-item" onClick={()=>setCart(old=>old.filter(x=>x.id!==p.id))} style={{background:'none', border:0, fontSize:12, opacity:.5, cursor:'pointer'}}>Remove</button></div>)}</div><div className="cart-summary" style={{marginTop:24, borderTop:'1px solid #ece9e5', paddingTop:16}}><div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}><span>Subtotal</span><strong>{fmt(total)}</strong></div><small style={{opacity:.6}}>Delivery calculated at checkout. Final stock and prices are verified by the server.</small><button className="btn btn-primary full" style={{width:'100%', marginTop:16}} onClick={()=>{setCartOpen(false);setCheckoutOpen(true)}}>Continue to checkout <ArrowUpRight size={16}/></button><button className="continue-shopping" style={{width:'100%', marginTop:12, background:'none', border:0, opacity:.6}} onClick={()=>setCartOpen(false)}>Continue shopping</button></div></>}</aside></div>}
  {checkoutOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckoutOpen(false)}}><section className="modal checkout-modal"><div className="drawer-head"><div><span className="eyebrow">ALMOST YOURS</span><h2>Checkout</h2></div><button className="icon-btn" onClick={()=>setCheckoutOpen(false)} aria-label="Close checkout"><X/></button></div><div className="checkout-total" style={{display:'flex', justifyContent:'space-between', marginBottom:12}}><span>{count} item(s)</span><strong>{fmt(total)}</strong></div><p className="form-hint" style={{opacity:.6, fontSize:13}}>Delivery details · South Africa</p><form className="checkout-form" onSubmit={placeOrder}><label>Full name<input required value={form.customer_name} onChange={e=>setField('customer_name',e.target.value)} autoComplete="name"/></label><label>Email address<input type="email" required value={form.email} onChange={e=>setField('email',e.target.value)} autoComplete="email"/></label><label>Phone number<input type="tel" required value={form.phone} onChange={e=>setField('phone',e.target.value)} autoComplete="tel"/></label><label className="wide">Street address<input required value={form.address} onChange={e=>setField('address',e.target.value)} autoComplete="street-address"/></label><label>City / town<input required value={form.city} onChange={e=>setField('city',e.target.value)} autoComplete="address-level2"/></label><label>Province<select required value={form.province} onChange={e=>setField('province',e.target.value)}>{['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'].map(p=><option key={p}>{p}</option>)}</select></label><label>Postal code<input required value={form.postal_code} onChange={e=>setField('postal_code',e.target.value)} autoComplete="postal-code"/></label><div className="payment-note wide" style={{display:'flex', gap:12, background:'#f5f3f0', padding:12, borderRadius:12}}><ShieldCheck size={19}/><span><strong>Pay securely with PayFast</strong><small style={{display:'block', opacity:.6}}>You'll continue to PayFast to complete payment. Live payment confirmation requires verified server notifications.</small></span></div><button className="btn btn-primary full wide" disabled={busy||!cart.length} style={{width:'100%'}}>{busy?'Preparing checkout…':`Continue to PayFast · ${fmt(total)}`}<ArrowUpRight size={16}/></button><small className="wide fine-print" style={{opacity:.5}}>Your order is checked against current product prices and stock before it is created.</small></form></section></div>}
  {accountOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAccountOpen(false)}}><section className="modal account-modal"><div className="drawer-head"><div><span className="eyebrow">YOUR URBAN CART</span><h2>{user?'Your account':authMode==='login'?'Welcome back.':'Join the good side.'}</h2></div><button className="icon-btn" onClick={()=>setAccountOpen(false)} aria-label="Close account"><X/></button></div>{user?<div className="account-content"><div className="account-avatar" style={{width:48, height:48, borderRadius:'50%', background:'#111', color:'#fff', display:'grid', placeItems:'center', fontSize:20}}>{user.name?.slice(0,1).toUpperCase()}</div><h3>{user.name}</h3><p>{user.email}</p><div className="account-orders"><h4>Recent orders</h4>{orders.length?orders.map(o=><div className="order-row" key={o.id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #eee'}}><span>Order #{o.id}<small style={{display:'block', opacity:.6}}>{new Date(o.created_at).toLocaleDateString('en-ZA')}</small></span><span>{fmt(o.total)}<small className="status" style={{display:'block', opacity:.6}}>{o.status}</small></span></div>):<p>Your order history will appear here.</p>}</div><button className="btn btn-outline full" style={{width:'100%', marginTop:16}} onClick={logout}>Sign out</button>{user.role==='admin'&&<button className="btn btn-primary full" style={{width:'100%', marginTop:8}} onClick={()=>{setAccountOpen(false);showAdmin()}}>Open admin orders</button>}</div>:<><div className="auth-tabs" style={{display:'flex', gap:8, marginBottom:16}}><button className={authMode==='login'?'selected':''} style={{flex:1, padding:10, borderRadius:999, border:'1px solid #ddd', background:authMode==='login'?'#111':'#fff', color:authMode==='login'?'#fff':'#111'}} onClick={()=>setAuthMode('login')}>Sign in</button><button className={authMode==='register'?'selected':''} style={{flex:1, padding:10, borderRadius:999, border:'1px solid #ddd', background:authMode==='register'?'#111':'#fff', color:authMode==='register'?'#fff':'#111'}} onClick={()=>setAuthMode('register')}>Create account</button></div><form className="auth-form" style={{display:'grid', gap:12}} onSubmit={submitAuth}>{authMode==='register'&&<label>Full name<input required minLength="2" value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))} style={{width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid #ece9e5', background:'#f5f3f0'}}/></label>}<label>Email address<input required type="email" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))} style={{width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid #ece9e5', background:'#f5f3f0'}}/></label><label>Password<input required type="password" minLength={authMode==='register'?8:1} value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} style={{width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid #ece9e5', background:'#f5f3f0'}}/>{authMode==='register'&&<small>Use at least 8 characters.</small>}</label><button className="btn btn-primary full" disabled={busy} style={{width:'100%', justifyContent:'center'}}>{busy?'Please wait…':authMode==='login'?'Sign in':'Create my account'}<ArrowUpRight size={16}/></button></form><p className="fine-print" style={{opacity:.5, fontSize:12, marginTop:12}}>Your account is stored securely. Never share your password with anyone.</p></>}</section></div>}
  {adminOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false)}}><section className="modal admin-modal"><div className="drawer-head"><div><span className="eyebrow">STORE MANAGEMENT</span><h2>Order dashboard</h2></div><button className="icon-btn" onClick={()=>setAdminOpen(false)} aria-label="Close admin"><X/></button></div><p className="form-hint" style={{opacity:.6}}>Recent orders · update status after checking payment and fulfilment.</p>{adminOrders.length?<div className="admin-list" style={{display:'grid', gap:12}}>{adminOrders.map(o=><div className="admin-order" key={o.id} style={{display:'flex', justifyContent:'space-between', padding:12, border:'1px solid #eee', borderRadius:12}}><div><strong>#{o.id} · {o.customer_name}</strong><small style={{display:'block', opacity:.6}}>{o.email} · {fmt(o.total)}</small><small style={{display:'block', opacity:.6}}>{new Date(o.created_at).toLocaleString('en-ZA')}</small></div><select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)} style={{padding:'8px 12px', borderRadius:8, border:'1px solid #ddd'}}>{['pending','paid','processing','shipped','cancelled'].map(s=><option key={s}>{s}</option>)}</select></div>)}</div>:<p>No orders yet.</p>}<button className="btn btn-outline full" style={{width:'100%', marginTop:16}} onClick={()=>setAdminOpen(false)}>Close dashboard</button></section></div>}
 </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);