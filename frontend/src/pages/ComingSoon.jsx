import { Link } from 'react-router-dom';

const ComingSoon = ({ pageName }) => {
  return (
    <div className="bg-white min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">{pageName}</span>
        </div>
      </div>

      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="text-center">
          <h1 className="text-3xl font-normal text-[#303030] mb-4">{pageName}</h1>
          <p className="text-[#666] mb-6">This page is coming soon.</p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-[#1f75cb] text-white text-sm font-medium rounded hover:bg-[#1068bf] transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ComingSoon;
